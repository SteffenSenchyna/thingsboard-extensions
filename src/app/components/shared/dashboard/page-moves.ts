///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import { Subject } from "rxjs";

/**
 * A dashboard moved to another page: its rail's lit entry changed (`tb-nav-rail`) — a rail click, an app's own page,
 * a Settings section, Back / Forward. It carries the dashboard root it happened in (Home's holds its nested app). Every
 * side panel open inside that root closes (`tb-detail-panel`, as its close button does), so no panel stays over a page
 * it isn't about. A list switched within a page (Access › Users' Users | Groups) lights no other entry: no move.
 */
export const DASHBOARD_PAGE_MOVES = new Subject<Element>();
