export type TaskStatus = 'completed' | 'incomplete' | 'na';

export interface ScheduleItem {
  id: string;
  startTime: Date;
  endTime: Date;
  task: string;
  type: 'work' | 'break';
  status: TaskStatus;
  distractionScore?: number;
}

export interface HistoryEntry {
    date: string;
    schedule: ScheduleItem[];
}