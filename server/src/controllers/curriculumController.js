const db = require('../config/database');

async function getFullCurriculum(req, res, next) {
  try {
    const { rows: quarters } = await db.query(
      `SELECT * FROM curriculum_quarters ORDER BY id ASC`
    );

    const { rows: topics } = await db.query(
      `SELECT * FROM curriculum_topics ORDER BY quarter_id ASC, order_index ASC`
    );

    const { rows: competencies } = await db.query(
      `SELECT lc.*, ct.topic_title, cq.quarter_code, cq.quarter_title
       FROM learning_competencies lc
       JOIN curriculum_topics ct ON lc.topic_id = ct.id
       JOIN curriculum_quarters cq ON ct.quarter_id = cq.id
       ORDER BY cq.id ASC, ct.order_index ASC`
    );

    // Assemble nested taxonomy Quarter -> Topics -> Competencies
    const taxonomy = quarters.map((q) => {
      const qTopics = topics
        .filter((t) => t.quarter_id === q.id)
        .map((t) => {
          const tCompetencies = competencies.filter((c) => c.topic_id === t.id);
          return {
            ...t,
            competencies: tCompetencies
          };
        });
      return {
        ...q,
        topics: qTopics
      };
    });

    res.json({
      success: true,
      taxonomy,
      flatCompetencies: competencies
    });
  } catch (err) {
    next(err);
  }
}

async function getCompetenciesByIlaw(req, res, next) {
  try {
    const { ilawTag } = req.params;
    const normalizedTag = ilawTag.toUpperCase();

    const validTags = ['INTENTIONS', 'LEARNING_EXPERIENCES', 'ASSESSMENT', 'WAYS_FORWARD'];
    if (!validTags.includes(normalizedTag)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ILAW tag. Allowed values: ${validTags.join(', ')}`
      });
    }

    const { rows: competencies } = await db.query(
      `SELECT lc.*, ct.topic_title, cq.quarter_code, cq.quarter_title
       FROM learning_competencies lc
       JOIN curriculum_topics ct ON lc.topic_id = ct.id
       JOIN curriculum_quarters cq ON ct.quarter_id = cq.id
       WHERE lc.ilaw_tag = ?
       ORDER BY cq.id ASC, ct.order_index ASC`,
      [normalizedTag]
    );

    res.json({
      success: true,
      ilawTag: normalizedTag,
      count: competencies.length,
      competencies
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getFullCurriculum,
  getCompetenciesByIlaw
};
