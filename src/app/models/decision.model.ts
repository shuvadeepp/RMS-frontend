// Request bodies are snake_case; decision and allocation responses are camelCase.
export type DecisionValue = 'SELECTED' | 'REJECTED' | 'ON_HOLD' | 'DEFERRED' | 'WITHDRAWN';

export interface DecisionRequest {
  matching_result_id: number;
  requirement_id: number;
  decision: DecisionValue;
  decision_reason: string;
}

export interface DecisionCreateResponse {
  allocationDecisionId: number;
  decision: DecisionValue;
  decisionMaker: number | string | null;
  allocationId: number | null;
}

// GET /api/decisions?requirementId= rows. Mostly camelCase; employee fields are read in both casings.
export interface DecisionHistoryItem {
  allocationDecisionId: number;
  allocationId?: number | null;
  createdAt?: string | null;
  decision: DecisionValue;
  decisionDate?: string | null;
  decisionMaker?: number | string | null;
  decisionMakerName?: string | null;
  decisionReason?: string | null;
  matchingResultId: number;
  requirementId?: number;
  employee_code?: string | null;
  employeeCode?: string | null;
  resource_name?: string | null;
  resourceName?: string | null;
}

// Shape used by the screens.
export interface DecisionRecord {
  id: number;
  matchingResultId: number;
  decision: DecisionValue;
  reason: string;
  maker: string;
  date: string | null;
  allocationId: number | null;
  employeeCode: string | null;
  resourceName: string | null;
}

export interface AllocationRequest {
  requirement_id: number;
  employee_id: number;
  allocation_percentage: number;
  start_date: string;
  end_date: string | null;
  decision_id: number;
}

export interface AllocationResponse {
  allocationId: number;
  allocationStatus: string;
  startDate: string;
}
