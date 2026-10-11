import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import useRemoteData from './useRemoteData';
import { activitiesFrom } from '../utils/learning';

export default function useLearnerData() {
  const { user } = useAuth();
  return useRemoteData(async () => {
    const requests = [ ['quizzes',api.getQuizzes], ['tasks',api.getPerformanceTasks], ['materials',api.getMaterials], ['logs',api.getReadLogs], ['interventions',api.getInterventions] ];
    const results = await Promise.allSettled(requests.map(([,load]) => load()));
    const data = { quizzes: [], tasks: [], materials: [], logs: [], interventions: [], warnings: [] };
    results.forEach((result,i) => {
      const key = requests[i][0];
      if (result.status === 'fulfilled' && result.value.success) data[key] = result.value[key] || [];
      else data.warnings.push(`Could not load ${key === 'logs' ? 'reading progress' : key}. ${result.status === 'rejected' ? result.reason.message : 'Please try again.'}`);
    });
    data.activities = activitiesFrom(data.quizzes,data.tasks);
    return data;
  }, [user?.id]);
}
