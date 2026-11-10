import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ReleaseRequest, ReleaseResponse, TaggedPerson } from '../models/tagged-people.model';

@Injectable({ providedIn: 'root' })
export class TaggedPeopleService {
  private api = inject(ApiService);

  // Everyone currently blocked from AI search, with their tags. Empty list when nobody is tagged.
  getTaggedPeople(): Observable<TaggedPerson[]> {
    return this.api.get<TaggedPerson[] | null>('/api/tagged-people').pipe(map(list => list ?? []));
  }

  // ADMIN only. 400 bad body, 403 not admin, 404 not found, 409 already released.
  release(request: ReleaseRequest): Observable<ReleaseResponse> {
    return this.api.post<ReleaseResponse>('/api/tagged-people/release', request);
  }
}
