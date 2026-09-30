// Earned Value Management (EVM) and Risk Projections Engine
import { Activity } from './cpm';
import { calculateProjectFinancials, calculateProjectProgress } from './projectMetrics';

export interface EVMMetrics {
  contractAmount: number;
  plannedProgress: number; // percentage (0 - 100)
  actualProgress: number; // percentage (0 - 100)
  scheduleVariance: number; // actualProgress - plannedProgress
  earnedValue: number; // NPR
  plannedValue: number; // NPR
  actualCost: number; // NPR
  cpi: number; // Cost Performance Index
  spi: number; // Schedule Performance Index
  forecastFinalCost: number; // Estimate at Completion (EAC)
  costOverrun: number; // EAC - Budget
  billingGap: number; // Work Done Value - IPC Submitted
  paymentGap: number; // IPC Certified - Payment Received
  cashGap: number; // Actual Cost Paid - Payment Received
}

export function calculateEVM(
  projectAmount: number,
  activities: Activity[],
  budgetHeads: any[],
  ipcSubmissions: any[],
  currentDateStr: string,
  options: { claims?: any[]; expenses?: any[]; ipcPayments?: any[] } = {},
): EVMMetrics {
  const progress = calculateProjectProgress(activities, currentDateStr);
  const financials = calculateProjectFinancials({
    contractAmount: projectAmount,
    budgetHeads,
    claims: options.claims,
    expenses: options.expenses,
    ipcSubmissions,
    ipcPayments: options.ipcPayments,
  });
  const { plannedProgress, actualProgress, scheduleVariance } = progress;
  const projectValue = financials.revisedContractAmount;

  // Earned Value and Planned Value
  const earnedValue = projectValue * (actualProgress / 100);
  const plannedValue = projectValue * (plannedProgress / 100);

  // 3. Actual Cost from Budget Heads
  const actualCost = financials.budgetActualCost;
  const internalBudget = budgetHeads.reduce((sum, bh) => sum + (Number.isFinite(Number(bh.internal_budget)) ? Number(bh.internal_budget) : 0), 0);

  // CPI and SPI
  const cpi = actualCost > 0 ? earnedValue / actualCost : 1.0;
  const spi = plannedValue > 0 ? earnedValue / plannedValue : 1.0;

  // EAC (Estimate at Completion)
  const forecastFinalCost = cpi > 0 ? internalBudget / cpi : internalBudget;
  const costOverrun = Math.max(0, forecastFinalCost - internalBudget);

  // IPC gaps
  // Work done value is equivalent to Earned Value (or contract value of actual completed)
  const workDoneValue = earnedValue; 
  
  const billingGap = Math.max(0, workDoneValue - financials.billedAmount);
  const paymentGap = financials.outstandingAmount;
  const cashGap = Math.max(0, actualCost - financials.paidAmount);

  return {
    contractAmount: projectValue,
    plannedProgress,
    actualProgress,
    scheduleVariance,
    earnedValue,
    plannedValue,
    actualCost,
    cpi,
    spi,
    forecastFinalCost,
    costOverrun,
    billingGap,
    paymentGap,
    cashGap
  };
}

// ------------------------------------------
// 4. Delay Risk Score Calculator
// ------------------------------------------
export interface RiskScoreDetails {
  score: number;
  category: 'low' | 'medium' | 'high' | 'critical';
  factors: Array<{ name: string; score: number }>;
}

export function calculateActivityRiskScore(
  activity: Activity,
  designPackages: any[],
  risks: any[]
): RiskScoreDetails {
  const factors: RiskScoreDetails['factors'] = [];
  let score = 0;

  // Factor 1: Criticality (+30 if critical, +10 if near-critical)
  if (activity.is_critical) {
    score += 30;
    factors.push({ name: 'Activity is on Critical Path', score: 30 });
  } else if (activity.is_near_critical) {
    score += 10;
    factors.push({ name: 'Activity is Near Critical (Float <= 7d)', score: 10 });
  }

  // Factor 2: Behind schedule (+20 if behind by >10%, +10 if behind by 1-10%)
  if (activity.status === 'in_progress') {
    const plannedProgress = 0.5; // Stub for comparison
    const actualProgress = activity.planned_quantity > 0 ? activity.actual_quantity / activity.planned_quantity : 0;
    const variance = actualProgress - plannedProgress;
    
    if (variance < -0.1) {
      score += 20;
      factors.push({ name: 'Behind schedule by more than 10%', score: 20 });
    } else if (variance < 0) {
      score += 10;
      factors.push({ name: 'Behind schedule (under 10%)', score: 10 });
    }
  }

  // Factor 3: Design Package status (+15 if associated design package is not approved)
  const matchingDesign = designPackages.find(dp => dp.wbs_code && activity.wbs_code.startsWith(dp.wbs_code));
  if (matchingDesign && matchingDesign.status !== 'approved') {
    score += 15;
    factors.push({ name: `Associated Design "${matchingDesign.name}" not approved`, score: 15 });
  }

  // Factor 4: Associated open risks (+15 if high risk, +10 if medium risk)
  const matchingRisks = risks.filter(r => r.wbs_code && activity.wbs_code.startsWith(r.wbs_code) && r.status !== 'closed');
  if (matchingRisks.length > 0) {
    let maxRiskScore = 0;
    matchingRisks.forEach(r => {
      const riskVal = r.probability * r.impact;
      if (riskVal >= 12 && maxRiskScore < 15) maxRiskScore = 15;
      else if (riskVal >= 6 && maxRiskScore < 10) maxRiskScore = 10;
    });
    if (maxRiskScore > 0) {
      score += maxRiskScore;
      factors.push({ name: 'Open risks in WBS path', score: maxRiskScore });
    }
  }

  // Factor 5: Material delivery / weather risk (+10 for weather vulnerability)
  if (activity.name.toLowerCase().includes('excavation') || activity.name.toLowerCase().includes('concrete')) {
    score += 10;
    factors.push({ name: 'Monsoon / weather disruption risk', score: 10 });
  }

  // Cap score to 100
  score = Math.min(100, score);

  let category: RiskScoreDetails['category'] = 'low';
  if (score > 75) category = 'critical';
  else if (score > 50) category = 'high';
  else if (score > 25) category = 'medium';

  return {
    score,
    category,
    factors
  };
}
