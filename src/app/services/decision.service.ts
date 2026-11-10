import { HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../core/api.service';
import {
  AllocationRequest,
  AllocationResponse,
  DecisionCreateResponse,
  DecisionHistoryItem,
  DecisionRecord,
  DecisionRequest
} from '../models/decision.model';

@Injectable({ providedIn: 'root' })
export class DecisionService {
  private api = inject(ApiService);

  // Marks the match RECOMMENDED.
  shortlist(matchingResultId: number): Observable<unknown> {
    return this.api.post<unknown>(`/api/matching-results/${matchingResultId}/shortlist`);
  }

  // Undo shortlist.
  unshortlist(matchingResultId: number): Observable<unknown> {
    return this.api.put<unknown>(`/api/matching-results/${matchingResultId}/recommendation`, {
      recommendation_status: 'REVIEW_REQUIRED'
    });
  }

  // decision_maker is never sent; the backend takes it from the token.
  createDecision(request: DecisionRequest): Observable<DecisionCreateResponse> {
    return this.api.post<DecisionCreateResponse>('/api/decisions', request);
  }

  getDecisions(requirementId: number): Observable<DecisionRecord[]> {
    return this.api
      .get<DecisionHistoryItem[]>('/api/decisions', { requirementId })
      .pipe(map(items => (items ?? []).map(toRecord)));
  }

  exportDecisions(requirementId: number | null): Observable<HttpResponse<Blob>> {
    return this.api.getBlob('/api/decisions/export', { requirementId });
  }

  // Only a SELECTED decision can be allocated (409 otherwise).
  createAllocation(request: AllocationRequest): Observable<AllocationResponse> {
    return this.api.post<AllocationResponse>('/api/allocations', request);
  }
}

function toRecord(item: DecisionHistoryItem): DecisionRecord {
  return {
    id: item.allocationDecisionId,
    matchingResultId: item.matchingResultId,
    decision: item.decision,
    reason: item.decisionReason ?? '',
    maker: item.decisionMakerName ?? makerLabel(item.decisionMaker ?? null),
    date: item.decisionDate ?? item.createdAt ?? null,
    allocationId: item.allocationId ?? null,
    employeeCode: item.employee_code ?? item.employeeCode ?? null,
    resourceName: item.resource_name ?? item.resourceName ?? null
  };
}

// The history may send the deciding user's numeric id instead of a name.
export function makerLabel(maker: number | string | null): string {
  if (maker === null || maker === '') return 'Someone';
  return typeof maker === 'number' || /^\d+$/.test(maker) ? `User #${maker}` : maker;
}
