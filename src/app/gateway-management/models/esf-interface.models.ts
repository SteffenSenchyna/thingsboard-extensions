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

// A network interface's settings on the ESF unit: Kura's NetworkConfigurationService holds every interface's, each setting named
// `net.interface.<interface>.…` ("net.interface.wlan0.config.ip4.address"). The Network view edits one interface at a time, as
// ESF's console does (`esf-interface-tabs.models.ts`).

/** Kura's network configuration component: every interface's settings. */
export const ESF_NETWORK_SERVICE = "org.eclipse.kura.net.admin.NetworkConfigurationService";
