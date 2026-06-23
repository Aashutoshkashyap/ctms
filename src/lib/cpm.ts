// Critical Path Method (CPM) Engine

export interface Activity {
  id: string;
  wbs_code: string;
  name: string;
  baseline_start: string; // YYYY-MM-DD
  baseline_finish: string; // YYYY-MM-DD
  planned_duration: number; // Days
  actual_start?: string | null;
  actual_finish?: string | null;
  remaining_duration?: number | null;
  planned_quantity: number;
  actual_quantity: number;
  unit: string;
  weightage: number; // percentage out of 100
  resource_required?: string;
  productivity_rate?: number; // target qty/day
  status: 'not_started' | 'in_progress' | 'completed';
  
  // Calculated fields (CPM outputs)
  early_start?: string;
  early_finish?: string;
  late_start?: string;
  late_finish?: string;
  total_float?: number;
  free_float?: number;
  is_critical?: boolean;
  is_near_critical?: boolean;
}

export interface Dependency {
  id: string;
  project_id?: string;
  predecessor_id: string;
  successor_id: string;
  type: 'FS' | 'SS' | 'FF' | 'SF';
  lag: number; // Positive for lag, negative for lead
}

export interface ProjectInfo {
  start_date: string;
  target_completion_date: string;
}

// Helper: Add days to date string
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + Math.round(days));
  return date.toISOString().split('T')[0];
}

// Helper: Diff in days between two date strings (d2 - d1)
export function diffDays(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const timeDiff = d2.getTime() - d1.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24));
}

// Helper: Format date
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// CPM Calculation Engine
export function calculateCPM(
  project: ProjectInfo,
  activities: Activity[],
  dependencies: Dependency[]
): Activity[] {
  if (activities.length === 0) return [];

  // Deep clone activities to avoid mutating inputs directly
  const acts: Activity[] = activities.map((a) => ({
    ...a,
    early_start: a.baseline_start,
    early_finish: a.baseline_finish,
    late_start: a.baseline_finish,
    late_finish: a.baseline_finish,
    total_float: 0,
    free_float: 0,
    is_critical: false,
    is_near_critical: false,
  }));

  const actMap = new Map<string, Activity>();
  acts.forEach((a) => actMap.set(a.id, a));

  // Determine current active duration for calculations
  // If actual dates are set, we respect them. If activity is in progress,
  // duration is elapsed actual days + forecast remaining duration.
  const getDuration = (a: Activity): number => {
    if (a.status === 'completed') {
      if (a.actual_start && a.actual_finish) {
        return Math.max(1, diffDays(a.actual_start, a.actual_finish));
      }
      return a.planned_duration;
    }
    if (a.status === 'in_progress') {
      const remaining = a.remaining_duration !== undefined && a.remaining_duration !== null
        ? a.remaining_duration
        : a.planned_duration * (1 - (a.actual_quantity / (a.planned_quantity || 1)));
      return Math.max(1, Math.ceil(remaining));
    }
    return a.planned_duration;
  };

  // Build Adjacency List for topological sorting
  // Forward pass sorting (from predecessor to successor)
  const adjList = new Map<string, Array<{ successorId: string; dep: Dependency }>>();
  const inDegree = new Map<string, number>();

  acts.forEach((a) => {
    adjList.set(a.id, []);
    inDegree.set(a.id, 0);
  });

  dependencies.forEach((d) => {
    if (actMap.has(d.predecessor_id) && actMap.has(d.successor_id)) {
      adjList.get(d.predecessor_id)!.push({ successorId: d.successor_id, dep: d });
      inDegree.set(d.successor_id, inDegree.get(d.successor_id)! + 1);
    }
  });

  // Topological Sort (Kahn's Algorithm)
  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    topoOrder.push(u);
    const neighbors = adjList.get(u) || [];
    neighbors.forEach(({ successorId }) => {
      inDegree.set(successorId, inDegree.get(successorId)! - 1);
      if (inDegree.get(successorId) === 0) {
        queue.push(successorId);
      }
    });
  }

  // Handle cycles or un-sortable items by adding remaining items to topological order
  if (topoOrder.length < acts.length) {
    acts.forEach((a) => {
      if (!topoOrder.includes(a.id)) {
        topoOrder.push(a.id);
      }
    });
  }

  // 1. FORWARD PASS (Early Start & Early Finish)
  topoOrder.forEach((id) => {
    const a = actMap.get(id)!;
    const dur = getDuration(a);

    // If actual start is already set (for in_progress/completed), use it as early start
    if (a.actual_start) {
      a.early_start = a.actual_start;
      a.early_finish = addDays(a.early_start, dur);
      return;
    }

    // Find all incoming dependencies
    const incomingDeps = dependencies.filter((d) => d.successor_id === id);

    if (incomingDeps.length === 0) {
      // No predecessor, starts at project start date
      a.early_start = project.start_date;
    } else {
      let maxES = project.start_date;

      incomingDeps.forEach((d) => {
        const pred = actMap.get(d.predecessor_id);
        if (!pred) return;

        let potentialES = project.start_date;
        const predES = pred.early_start!;
        const predEF = pred.early_finish!;

        // Finish-to-Start (FS), Start-to-Start (SS), Finish-to-Finish (FF), Start-to-Finish (SF)
        if (d.type === 'FS') {
          potentialES = addDays(predEF, d.lag);
        } else if (d.type === 'SS') {
          potentialES = addDays(predES, d.lag);
        } else if (d.type === 'FF') {
          // Successor finish = predecessor finish + lag -> ES = EF - dur
          const potentialEF = addDays(predEF, d.lag);
          potentialES = addDays(potentialEF, -dur);
        } else if (d.type === 'SF') {
          // Successor finish = predecessor start + lag -> ES = EF - dur
          const potentialEF = addDays(predES, d.lag);
          potentialES = addDays(potentialEF, -dur);
        }

        if (diffDays(maxES, potentialES) > 0) {
          maxES = potentialES;
        }
      });

      a.early_start = maxES;
    }

    a.early_finish = addDays(a.early_start, dur);
  });

  // Calculate project actual calculated finish
  let projectFinish = project.target_completion_date;
  acts.forEach((a) => {
    if (a.early_finish && diffDays(projectFinish, a.early_finish) > 0) {
      projectFinish = a.early_finish;
    }
  });

  // 2. BACKWARD PASS (Late Start & Late Finish)
  // Process in reverse topological order
  for (let i = topoOrder.length - 1; i >= 0; i--) {
    const id = topoOrder[i];
    const a = actMap.get(id)!;
    const dur = getDuration(a);

    // If activity is completed, its late dates match its actual finish
    if (a.status === 'completed' && a.actual_finish) {
      a.late_finish = a.actual_finish;
      a.late_start = a.actual_start || addDays(a.late_finish, -dur);
      continue;
    }

    const outgoingDeps = dependencies.filter((d) => d.predecessor_id === id);

    if (outgoingDeps.length === 0) {
      // No successor, late finish is the project finish
      a.late_finish = projectFinish;
    } else {
      let minLF = projectFinish;

      outgoingDeps.forEach((d) => {
        const succ = actMap.get(d.successor_id);
        if (!succ) return;

        let potentialLF = projectFinish;
        const succES = succ.early_start!;
        const succEF = succ.early_finish!;
        const succLS = succ.late_start || succES;
        const succLF = succ.late_finish || succEF;

        if (d.type === 'FS') {
          potentialLF = addDays(succLS, -d.lag);
        } else if (d.type === 'SS') {
          // Successor start = predecessor start + lag -> LF = LS + dur
          const potentialLS = addDays(succLS, -d.lag);
          potentialLF = addDays(potentialLS, dur);
        } else if (d.type === 'FF') {
          potentialLF = addDays(succLF, -d.lag);
        } else if (d.type === 'SF') {
          potentialLF = addDays(succLS, -d.lag);
        }

        if (diffDays(potentialLF, minLF) > 0) {
          minLF = potentialLF;
        }
      });

      a.late_finish = minLF;
    }

    a.late_start = addDays(a.late_finish, -dur);
  }

  // 3. FLOAT & CRITICAL PATH DESIGNATION
  acts.forEach((a) => {
    if (a.early_start && a.late_start && a.early_finish && a.late_finish) {
      // Total Float = LF - EF (or LS - ES)
      a.total_float = diffDays(a.early_finish, a.late_finish);
      
      // Free Float calculation
      const outgoingDeps = dependencies.filter((d) => d.predecessor_id === a.id);
      if (outgoingDeps.length === 0) {
        a.free_float = diffDays(a.early_finish, projectFinish);
      } else {
        let minFF = Infinity;
        outgoingDeps.forEach((d) => {
          const succ = actMap.get(d.successor_id);
          if (!succ) return;
          const succES = succ.early_start;
          if (!succES) return;
          
          let potentialFF = 0;
          if (d.type === 'FS') {
            potentialFF = diffDays(a.early_finish!, succES) - d.lag;
          } else if (d.type === 'SS') {
            potentialFF = diffDays(a.early_start!, succES) - d.lag;
          }
          if (potentialFF < minFF) {
            minFF = potentialFF;
          }
        });
        a.free_float = minFF === Infinity ? 0 : Math.max(0, minFF);
      }

      // Mark Critical / Near Critical
      a.is_critical = a.total_float <= 0;
      a.is_near_critical = a.total_float > 0 && a.total_float <= 7;
    }
  });

  return acts;
}

// Progress calculation based on quantity and dates
export interface ProgressUpdate {
  activityId: string;
  date: string;
  quantityCompletedToday: number;
  elapsedWorkingDays: number;
}

export function projectProgress(
  activity: Activity,
  update: ProgressUpdate
): {
  actualProgressToday: number;
  remainingQuantity: number;
  actualProductivity: number;
  forecastRemainingDuration: number;
  forecastFinishDate: string;
} {
  const totalQty = activity.planned_quantity || 1;
  const newActualQty = activity.actual_quantity + update.quantityCompletedToday;
  const actualProgressToday = newActualQty / totalQty;
  
  const remainingQuantity = Math.max(0, totalQty - newActualQty);
  
  // Calculate productivity (units/day)
  const actualProductivity = update.elapsedWorkingDays > 0 
    ? newActualQty / update.elapsedWorkingDays 
    : (activity.productivity_rate || (totalQty / activity.planned_duration));
  
  // Forecast remaining duration
  const forecastRemainingDuration = actualProductivity > 0 
    ? remainingQuantity / actualProductivity 
    : activity.planned_duration;
    
  const forecastFinishDate = addDays(update.date, forecastRemainingDuration);

  return {
    actualProgressToday,
    remainingQuantity,
    actualProductivity,
    forecastRemainingDuration,
    forecastFinishDate,
  };
}
