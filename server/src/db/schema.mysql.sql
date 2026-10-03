-- =====================================================================
-- ARALYTICS: DATA-PERSISTENCE-LAYER
-- ENGINE: MySQL 8.0+ / MariaDB 10.5+
-- ARCHITECTURE: Strict Relational Integrity & Automated Intervention Triggers
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `aralytics_db`
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `aralytics_db`;

-- Drop existing tables in reverse dependency order for clean recreation if required
DROP TRIGGER IF EXISTS `trg_quiz_attempts_auto_intervention`;
DROP TABLE IF EXISTS `security_logs`;
DROP TABLE IF EXISTS `interventions`;
DROP TABLE IF EXISTS `quiz_attempts`;
DROP TABLE IF EXISTS `quizzes`;
DROP TABLE IF EXISTS `materials`;
DROP TABLE IF EXISTS `competencies`;
DROP TABLE IF EXISTS `users`;

-- 1. USERS TABLE (Role-Based Access Control)
CREATE TABLE `users` (
  `id` VARCHAR(36) NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('TEACHER', 'STUDENT') NOT NULL DEFAULT 'STUDENT',
  `section_id` VARCHAR(50) NULL COMMENT 'Class section identifier, e.g. 10-Rizal',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_section` (`section_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. COMPETENCIES TABLE (ILAW Taxonomy)
CREATE TABLE `competencies` (
  `id` VARCHAR(36) NOT NULL,
  `quarter` ENUM('Q1', 'Q2', 'Q3', 'Q4') NOT NULL,
  `topic_title` VARCHAR(255) NOT NULL,
  `ilaw_category` ENUM('INTENTIONS', 'LEARNING_EXPERIENCES', 'ASSESSMENT', 'WAYS_FORWARD') NOT NULL,
  `description` TEXT NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_competencies_quarter` (`quarter`),
  INDEX `idx_competencies_ilaw` (`ilaw_category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. INSTRUCTIONAL & REMEDIAL MATERIALS TABLE
CREATE TABLE `materials` (
  `id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `file_type` ENUM('PPT', 'PDF', 'DOCX', 'VIDEO') NOT NULL,
  `competency_id` VARCHAR(36) NOT NULL,
  `is_remedial` BOOLEAN NOT NULL DEFAULT FALSE,
  `uploaded_by` VARCHAR(36) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`competency_id`) REFERENCES `competencies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  INDEX `idx_materials_competency_remedial` (`competency_id`, `is_remedial`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. QUIZZES TABLE (Strictly Online Assessments)
CREATE TABLE `quizzes` (
  `id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `competency_id` VARCHAR(36) NOT NULL,
  `passing_score` INT NOT NULL DEFAULT 0,
  `time_limit_mins` INT NOT NULL DEFAULT 20,
  `is_published` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`competency_id`) REFERENCES `competencies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_quizzes_competency` (`competency_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. QUIZ ATTEMPTS TABLE (Submissions & Scores)
CREATE TABLE `quiz_attempts` (
  `id` VARCHAR(36) NOT NULL,
  `quiz_id` VARCHAR(36) NOT NULL,
  `student_id` VARCHAR(36) NOT NULL,
  `score` INT NOT NULL DEFAULT 0,
  `total_points` INT NOT NULL DEFAULT 1,
  `is_passed` BOOLEAN NOT NULL DEFAULT FALSE,
  `tab_switch_count` INT NOT NULL DEFAULT 0,
  `submitted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_attempts_student` (`student_id`),
  INDEX `idx_attempts_quiz` (`quiz_id`),
  INDEX `idx_attempts_passed` (`is_passed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. SECURITY LOGS TABLE (Proctoring & Tab-Switch Audit Trail)
CREATE TABLE `security_logs` (
  `id` VARCHAR(36) NOT NULL,
  `attempt_id` VARCHAR(36) NOT NULL,
  `event_type` ENUM('TAB_SWITCH', 'WINDOW_BLUR') NOT NULL,
  `timestamp` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_security_logs_attempt` (`attempt_id`),
  INDEX `idx_security_logs_event` (`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. INTERVENTIONS TABLE (Automated Ways Forward Remediation)
CREATE TABLE `interventions` (
  `id` VARCHAR(36) NOT NULL,
  `student_id` VARCHAR(36) NOT NULL,
  `competency_id` VARCHAR(36) NOT NULL,
  `recommended_material_id` VARCHAR(36) NULL,
  `status` ENUM('RECOMMENDED', 'ASSIGNED', 'COMPLETED') NOT NULL DEFAULT 'RECOMMENDED',
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`student_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`competency_id`) REFERENCES `competencies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`recommended_material_id`) REFERENCES `materials`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX `idx_interventions_student_status` (`student_id`, `status`),
  INDEX `idx_interventions_competency` (`competency_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- DATABASE HOOK LOGIC: AUTOMATED MYSQL TRIGGER
-- Upon quiz_attempts insertion:
-- Calculates (score / total_points). If percentage < 75% (0.75),
-- finds remedial material for the quiz's competency and inserts into interventions.
-- =====================================================================

DELIMITER $$

CREATE TRIGGER `trg_quiz_attempts_auto_intervention`
AFTER INSERT ON `quiz_attempts`
FOR EACH ROW
BEGIN
  DECLARE v_competency_id VARCHAR(36);
  DECLARE v_material_id VARCHAR(36) DEFAULT NULL;
  DECLARE v_pct DECIMAL(7, 4);

  -- Prevent division by zero
  IF NEW.total_points > 0 THEN
    SET v_pct = (NEW.score / NEW.total_points);
  ELSE
    SET v_pct = 0.0000;
  END IF;

  -- Threshold check: If percentage is below 75%
  IF v_pct < 0.7500 THEN
    -- Retrieve the competency_id linked to the quiz
    SELECT `competency_id` INTO v_competency_id
    FROM `quizzes`
    WHERE `id` = NEW.quiz_id
    LIMIT 1;

    -- Query matching remedial material for this competency
    SELECT `id` INTO v_material_id
    FROM `materials`
    WHERE `competency_id` = v_competency_id
      AND `is_remedial` = TRUE
    ORDER BY `created_at` ASC
    LIMIT 1;

    -- Automatically queue into interventions table
    INSERT INTO `interventions` (
      `id`,
      `student_id`,
      `competency_id`,
      `recommended_material_id`,
      `status`,
      `updated_at`
    ) VALUES (
      UUID(),
      NEW.student_id,
      v_competency_id,
      v_material_id,
      'RECOMMENDED',
      NOW()
    );
  END IF;
END$$

DELIMITER ;
