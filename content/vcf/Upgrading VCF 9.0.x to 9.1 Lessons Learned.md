+++
title = "Upgrading VCF 9.0.x to 9.1: What Actually Matters"
date = "2026-08-06"
draft = false
description = "Practical guidance for upgrading VMware Cloud Foundation 9.0.x to 9.1, based on a 9.0.2 upgrade and organized around Management Services, DNS, Fleet Lifecycle, Automation, and validation."
images = ["/images/vcf/vcf-9-1-upgrade/vcf-9-1-upgrade-hero-v2.png"]
featureimage = "images/vcf/vcf-9-1-upgrade/vcf-9-1-upgrade-hero-v2.png"
hideFeatureImage = true
aliases = ["/vcf/upgrading-vcf-9.0.2-to-9.1-lessons-learned/"]
tags = ["VCF", "VMware Cloud Foundation", "VCF 9.1", "Upgrade", "SDDC Manager", "VCF Operations", "VCF Automation", "Fleet Lifecycle"]
categories = ["VCF"]

showDate = true
showReadingTime = true
showWordCount = false
showTableOfContents = true
showHero = false
imagePosition = "center"
+++

{{< article-cover src="images/vcf/vcf-9-1-upgrade/vcf-9-1-upgrade-hero-v2.png" alt="Private cloud infrastructure transitioning to a modernized VCF platform" >}}

When I started preparing for VCF 9.1, I expected a familiar maintenance window: download the binaries from the depot, run the prechecks, and work through the component upgrades. Easy day, basically the same rhythm we followed getting to 9.0.2.

That was not quite how this one went. The component upgrades were only half the work. VCF 9.1 introduces a new Management Services architecture, additional IP pools and DNS records, a License Server appliance, a new lifecycle inventory model, and a blue-green Automation migration. Most of the problems we encountered came from those dependencies rather than the upgrade buttons themselves.

This guidance applies to supported VCF 9.0.x-to-9.1 paths. Our starting build was 9.0.2, and the environment included VCF Operations, Automation, vCenter, NSX, ESX, and workload domains. The sequence below follows our path, including a stale SDDC Manager lock and failed Automation import that reinforced the importance of validating each dependency before continuing. Generate the Upgrade Planner path for your exact topology, but use these lessons to make its prompts and stopping points easier to understand.

## First, Understand the VCF 9.1 Architecture

The first VCF instance carries the fleet-level services and has the largest binary and network footprint. Additional instances deploy a smaller set of instance-level services and use the fleet services established by the first instance. This is why the upgrade needs a dedicated runtime IP pool plus separate fleet, instance, runtime, licensing, and optional-service FQDNs.

{{< sharp-diagram src="/images/vcf/vcf-9-1-upgrade/vcf-9-1-fleet-logical-architecture.png" type="image/png" ratio="2320 / 1534" zoom="true" alt="VCF 9.1 logical architecture showing fleet-level Operations and Automation, a VCF instance, its management domain, workload domains, Management Services, License Server, vCenter, NSX, and ESX clusters." >}}

Operations and Automation sit at the fleet level. A VCF instance contains the management and workload domains, while Management Services, the License Server, SDDC Manager, management vCenter, and management NSX live in the management domain. These scope boundaries drive many of the DNS, address, binary, and latency requirements that follow.

## Before the Window: Generate the Path and Finish the Network Design

My starting point was the [VCF Upgrade Planner path for VCF 9.0 to 9.1 with Automation](https://vmware.github.io/vcf-upgrade-planner/VCF-9.0-to-VCF-9.1-(VCF-Automation-included).html). Thank you to [William Lam](https://williamlam.com/) for making the product dependencies easy to follow. Generate the path for the versions and optional products in your environment rather than treating another environment's sequence as universal.

### Verify the Identity Broker deployment

One of the first decisions in the generated path is how the existing Identity Broker will transition into Management Services. Check **Fleet Management → Identity & Access → VCF SSO Overview** and identify its mode, network, and datastore. If a healthy 9.0 Identity Broker is already on the planned Management Services network, do not rebuild it or request another FQDN. Select its mode in the Upgrade Planner; the 9.1 workflow migrates an external appliance into Management Services and powers down the old VMs. Validate SSO before deleting them.

An appliance on a different network or unsupported datastore needs a separate, potentially disruptive transition. [KB 444734](https://knowledge.broadcom.com/external/article/444734/transition-a-vcf-identity-broker-90x-ins.html) covers that exception, and [KB 441285](https://knowledge.broadcom.com/external/article/441285/vcf-identity-broker-upgrade-from-vcf-90x.html) collects known failures.

Use the VCF 9.1 Planning and Preparation Workbook to tie each FQDN to an address, VLAN, certificate, and owner. This caught more problems than confirming that the management `/24` had free space. [Download a clean workbook](/downloads/vcf-9.1-planning-and-preparation-workbook.xlsx) and adapt it to your environment.

The phases below follow Broadcom's required management-component order. Complete the DNS, addressing, certificate, and placement decisions before the maintenance window, even when the associated values are not entered until a later phase.

## Phase 1: Upgrade VCF Operations with the Product PAK

Sign in to the [Broadcom Support Portal](https://support.broadcom.com/group/ecx/productdownloads) and download the VCF Operations **product-upgrade PAK** for the intended 9.1 build. Choose the Virtual Appliance package for the Operations cluster, or the combined Virtual Appliance and Cloud Proxy package when the environment also needs its Cloud Proxies updated. Do not use the Cloud Proxy-only PAK for the core cluster. Verify the downloaded file's build and checksum before the window; [KB 431008](https://knowledge.broadcom.com/external/article/431008/version-remains-unchanged-in-vmware-aria.html) explains the package variants and how the wrong one can appear to install without upgrading the product.

Open the VCF Operations administration interface directly at `https://<vcf-operations-fqdn>/admin` and sign in with the local Operations admin account. This is separate from the normal product interface at `/ui`. From the admin interface, select **Software Update → Install a Software Update**, upload the VCF Operations product-upgrade PAK (not a management-pack or adapter package), and monitor the installation. [KB 428018](https://knowledge.broadcom.com/external/article/428018/vcf-operations-appliance-update-with-vv.html) documents the same admin URL and upload path.

This step unlocks the remaining binary workflow. While Operations is on 9.0, SDDC Manager may offer 9.1 in **Binary Management** but show no Upgrade, Patch, or Install binaries. [KB 440282](https://knowledge.broadcom.com/external/article/440282/vcf-91-upgrade-binaries-do-not-show-up-i.html) explains that after applying the PAK, you upgrade SDDC Manager, configure the new Software Depot, and retrieve the other component binaries.

{{< sharp-diagram src="/images/vcf/vcf-9-1-upgrade/pak-upload-warning.png" type="image/png" ratio="1617 / 973" alt="Sanitized VCF Operations warning shown before uploading the 9.1 product-upgrade PAK." >}}

Although the warning recommends Fleet Management, this transition still uses the direct PAK and later moves the 9.0 Fleet Management data into 9.1. Confirm that the Operations cluster is online, the PAK matches the target build, and required backups exist.

### Next, deploy the License Server appliance

VCF Operations 9.1 introduces a new licensing interface. Go to **Manage → Licensing → Licenses & Registration**. The page provides the Broadcom portal link for downloading the License Server OVA and displays the unique registration key required during deployment.

Deploy the OVA to the management-domain vCenter using the reserved License Server FQDN and IP, and enter that registration key when prompted. The OVA deployment is a manual step. In connected mode, what happens after deployment is automated: the appliance connects to VCF Operations, associates with the VCF Business Services Console, registers, and retrieves the allocated licenses. Confirm that sequence completes before starting the vCenter and ESX phases.

Create both an A record and PTR record before deployment. If the environment uses `172.17.0.0/16` for DNS or another reachable network, use License Server `9.1.0.0200` or later; earlier builds can conflict with the appliance's Docker network and boot to a black console. [KB 441526](https://knowledge.broadcom.com/external/article/441526/vcf-91-license-server-console-displays-a.html) covers that condition.

{{< sharp-diagram src="/images/vcf/vcf-9-1-upgrade/vcf-9-1-license-server-architecture-v2.png" type="image/png" ratio="1600 / 840" alt="VCF 9.1 licensing architecture showing the Business Services Console, VCF Operations, the local License Server, vCenter, ESX hosts, Log Management, and other VCF components." >}}

*Simplified diagram based on Broadcom's [VCF 9.1 licensing guidance](https://blogs.vmware.com/cloud-foundation/2026/05/18/vcf-9-1-licensing-programmatic-centralized-and-built-to-scale/).*

Entitlements originate in the Business Services Console; Operations manages them, and the License Server connects them to vCenter, where components and hosts obtain their licenses. VCF 9.1 also automates the ongoing connected-mode exchange: usage is sent to Broadcom and an updated license file is downloaded and applied every 24 hours. In VCF 9.0 connected mode, an administrator still had to acknowledge the refreshed license file at least once every 180 days. Disconnected mode continues to use manually transferred usage and license files. See Broadcom's [VCF 9.1 licensing architecture article](https://blogs.vmware.com/cloud-foundation/2026/05/18/vcf-9-1-licensing-programmatic-centralized-and-built-to-scale/), its [VCF 9.0 licensing comparison](https://blogs.vmware.com/cloud-foundation/2025/06/24/licensing-in-vmware-cloud-foundation-9-0/), and [KB 437242](https://knowledge.broadcom.com/external/article/437242/getting-started-with-vmware-cloud-founda.html).

Verify **Manage → Licensing → Licenses & Registration**, confirm the server is connected, and compare allocated capacity with managed cores. An underlicensed vCenter can block the ESX precheck; see [KB 447737](https://knowledge.broadcom.com/external/article/447737/the-current-vcenter-is-not-licensed-by-a.html).

## Phase 2: Precheck and Upgrade SDDC Manager, Then Deploy Management Services

Our SDDC Manager health check reported a resource lock with no active workflow in the UI. [KB 439473](https://knowledge.broadcom.com/external/article/439473/sddc-manager-health-check-fails-with-res.html) covers stale locks left by earlier tasks. Verify that no legitimate workflow owns the lock, follow the KB's backup safeguards, and rerun the full health check after remediation.

Once the precheck passes, start the SDDC Manager 9.1 upgrade. Do not stop at the green check. Monitor the task through completion, sign back in, and verify the reported version and overall health. Then configure the new Software Depot connection and retrieve the remaining binaries. That upgraded SDDC Manager and depot workflow is what enables the Management Services deployment and the component upgrades that follow.

### What VCF Management Services actually is

VCF Management Services is a set of containerized services running on **VCF Services Runtime**, a Kubernetes-based platform deployed as VMs in the management domain. It is management infrastructure for VCF itself, not a general-purpose Kubernetes cluster for application workloads. Broadcom's [VCF Management Services documentation](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/deployment/vcf-management-appliances.html#GUID-2bab6de2-024a-4900-9716-7fba53ea0721-en_id-e0fe7eb4-1875-4819-dca9-c34434b2d173) describes the architecture and its role in a VCF 9.1 deployment.

The main consolidation is lifecycle management. Responsibilities from the standalone 9.0 Fleet Management appliance move into **Fleet Lifecycle** for fleet-wide products and **SDDC Lifecycle** for each VCF instance. The platform also hosts **Software Depot**, **Salt RaaS**, **Salt Master**, and **Telemetry**. An existing 9.0 **Identity Broker** is migrated into it, while **Real-Time Metrics** and **Log Management** can be added as Management Services components.

VCF Operations, vCenter, NSX, Automation, and Operations for Networks remain separate products managed through this lifecycle model; they do not run inside Management Services. The License Server is also a separate appliance, deployed from the OVA downloaded through the VCF Operations licensing workflow described in Phase 1.

### Enter the Management Services addresses

For the initial Management Services deployment, Broadcom documents a minimum of 12 addresses and allows another 18 to be added later for new services, scale-out, and future upgrades, for 30 addresses in total. All of these ranges must be on the management network, and later ranges do not have to be contiguous. For targets from 9.1.0.0 through 9.1.0.300, the UI expects an aligned `/28` for the initial allocation or `/27` for the full allocation. Starting with 9.1.0.400, the UI can exclude addresses from the CIDR or accept a comma-separated list of contiguous or non-contiguous addresses. If the management network cannot hold the range, an API-driven deployment can use a custom VLAN-backed network. [KB 440223](https://knowledge.broadcom.com/external/article/440223/vcf-91-vmsp-cluster-deployment-fails-due.html) explains the supported choices.

Enter the CIDR as an aligned **network address/prefix**, not the first usable host. For `192.0.2.160/28`, `.160` is the network address, `.161–.174` are the 14 traditional host addresses, and `.175` is broadcast; the workflow uses this block size for its 12-address minimum. A `/28` has 16 total addresses, mask `255.255.255.240`, and boundaries every 16 addresses.

For `192.0.2.160/27`, `.160` is the network address, `.161–.190` are the 30 usable addresses, and `.191` is broadcast. A `/27` has 32 total addresses, mask `255.255.255.224`, and boundaries every 32 addresses. Reserve the complete block in IPAM. Named endpoints remain outside this runtime CIDR.

The runtime range is only part of the request. The installer also needs unique, DNS-backed endpoints outside that range:

| Installer endpoint | Services using the endpoint | Example FQDN | Example IP |
|---|---|---|---|
| Fleet components FQDN | Fleet Lifecycle, Salt RaaS, and Software Depot | `vcf-fleet-01.example.com` | `192.0.2.40` |
| Instance components FQDN | SDDC Lifecycle, Salt Master, metrics, and telemetry | `vcf-instance-01.example.com` | `192.0.2.41` |
| VCF services runtime FQDN | VCF Services Runtime | `vcf-runtime-01.example.com` | `192.0.2.42` |
| VCF Identity Broker FQDN (conditional) | Identity Broker when one is not already deployed | `vcf-idb-01.example.com` | `192.0.2.43` |
| License Server FQDN | Local VCF License Server appliance | `vcf-license-01.example.com` | `192.0.2.44` |
| VCF Automation services runtime FQDN | Internal Automation services runtime | `vcfa-runtime-01.example.com` | `192.0.2.72` |

Create forward and reverse records, keep the names lowercase, and verify that every endpoint resolves to its own address. The Identity Broker row applies only when one is not already deployed or its documented transition requires a new address.

{{< sharp-diagram src="/images/vcf/vcf-9-1-upgrade/duplicate-fqdn-validation.svg" alt="Sanitized validation error showing why the runtime, fleet, and instance endpoints need unique names and addresses." >}}

This validation failed because the runtime and fleet fields were given the same FQDN. DNS therefore resolved both fields to `192.0.2.42`, producing both a duplicate-name and duplicate-address error. Give the runtime, fleet, and instance endpoints separate FQDNs and separate IPs.

Also verify that every named endpoint and every address in the runtime block is actually unused before starting the deployment. Check IPAM and DNS, then use the network team's normal duplicate-address checks, such as ARP or neighbor-table inspection from the local segment, rather than relying on ping alone. The installer can catch duplicates within its input and some DNS conflicts, but it should not be treated as the authoritative test for an address already assigned to another device.

VCF Services Runtime also uses an internal network, `198.18.0.0/15` by default. That is not the Management Services address pool, and it must not overlap anything routed in the environment. If it does, Broadcom documents alternative internal ranges and a JSON deployment method in [KB 440541](https://knowledge.broadcom.com/external/article/440541/deploying-vcf-91-fails-at-deploy-and-con.html).

### Validate placement against the latency diagram

The workbook tells you where components will live; the latency diagram tells you whether they should live there.

{{< sharp-diagram src="/images/vcf/vcf-9-1-upgrade/vcf-9-1-fleet-latency-logical-diagram.png" type="image/png" ratio="2559 / 1770" zoom="true" alt="VMware Cloud Foundation 9.1 fleet latency requirements across primary and secondary VCF instances." >}}

*Source: Broadcom's [VMware Ports and Protocols network-diagram portal](https://ports.broadcom.com/network-diagrams/VMware-Cloud-Foundation).*

The diagram shows up to 300 ms for many fleet-level paths, but tighter limits of 50 ms around collectors and management components, 100 ms between vCenter and SDDC Manager or Supervisor, and 150 ms for several NSX Edge, workload-domain, Enhanced Linked Mode, and long-distance vMotion paths. It also calls for at least 10 Mbps on the illustrated NSX-to-ESX Edge path. These values should drive placement and inter-site testing. [KB 412252](https://knowledge.broadcom.com/external/article/412252/clarification-on-maximum-network-latency.html) notes that installation may not enforce every limit, but exceeding them can still affect stability and performance.

Once prechecks were clean, we deployed the Management Services platform planned above. During this transition, the standalone 9.0 Fleet Management appliance data and responsibilities move into the new lifecycle model; the old appliance has no direct upgrade path. Do not use the 9.0 Fleet Management appliance to perform 9.1 upgrades. After validating Fleet Lifecycle and SDDC Lifecycle, the old appliance can be decommissioned.

One practical warning from the product guide: do not move the deployed Management Services VMs into another folder or resource pool. Later patch, scale-out, and deployment workflows depend on their expected placement.

## Phase 3: Verify the Fleet Inventory Before Continuing

Management Services completed, but Automation did not import into Fleet Lifecycle. The application was running; lifecycle discovery was not.

{{< sharp-diagram src="/images/vcf/vcf-9-1-upgrade/fleet-inventory-automation-warning.png" type="image/png" ratio="1579 / 996" alt="Sanitized Fleet Lifecycle inventory showing Automation blocked while other management components were discovered." >}}

The task reported that Automation could not be discovered through SSH.

{{< sharp-diagram src="/images/vcf/vcf-9-1-upgrade/vcfa-discovery-warning.png" type="image/png" ratio="1619 / 971" alt="Sanitized task detail showing failed Automation discovery over SSH." >}}

A healthy application is not automatically ready for lifecycle management. Fleet Lifecycle must reach it, validate credentials and identity, associate the correct vCenter, and add it to inventory. [KB 441858](https://knowledge.broadcom.com/external/article/441858/import-vcf-operations-in-fleet-lifecycle.html) distinguishes remediation for a failed deployment from one completed with warnings.

Account for every component before continuing and validate its certificate. VCF Operations for Networks, for example, requires every platform and collector FQDN and IP in the certificate SAN; see [KB 424807](https://knowledge.broadcom.com/external/article/424807/certificate-requirements-for-vcf-operati.html). It cannot be upgraded from its own UI in this path; use the VCF Operations Fleet Lifecycle workflow. [KB 440459](https://knowledge.broadcom.com/external/article/440459) documents the related Fleet import failure when the certificate SAN is incomplete.

## Phase 4: Upgrade the Management Domain and Validate Its Consumers

Follow the planner's component order. In our path, every core phase had a precheck and validation gate before the next dependency.

{{< sharp-diagram src="/images/vcf/vcf-9-1-upgrade/component-version-drift.png" type="image/png" ratio="1620 / 971" alt="Sanitized component-version view illustrating the temporary version drift during a staged upgrade." >}}

A mixed-version state is normal during the plan, but do not leave it there unnecessarily. After vCenter and NSX, I checked DNS, certificates, provider connections, north-south and east-west traffic, and an Automation provisioning operation. The phase was complete only when dependent services still worked.

Our workloads remained online while ESX hosts were evacuated and upgraded one at a time; the main interruption was brief management-plane availability around vCenter. This is not a guarantee. Cluster capacity, pinned workloads, storage, NSX, and patch method change the impact.

The ESX prechecks surfaced the same Intel volume-management warning seen previously. Acknowledging that known warning cleared the precheck; no separate driver, firmware, or VIB fix was applied. Record and understand a warning before accepting it: acknowledgment releases the workflow but does not prove the underlying condition is fixed.

## Phase 5: Upgrade Automation and Finish the Remaining Products

Automation uses a blue-green migration: the new 9.1 nodes are built while the 9.0.x nodes remain available, then the old nodes are shut down after the migration completes. Their addresses cannot be reused at the start.

For targets through 9.1.0.300, reserve an eight-address `/29`. Three addresses are assigned to the new Automation nodes, two are retained for failed-node replacement or rolling maintenance, and three remain unused. The Automation services-runtime FQDN needs another address outside the `/29`, making the planning requirement **nine addresses in total**.

Starting with 9.1.0.400, the unused three addresses are no longer required. Provide **five unique addresses**: three for the Automation nodes and two for replacement or rolling-maintenance capacity. Those five can be contiguous or non-contiguous and can be supplied using the newer address-selection options. The separate services-runtime FQDN still needs its own address, making the 9.1.0.400-and-later planning requirement **six addresses in total**.

The existing user-facing Automation FQDN and load-balancer VIP stay the same and transfer to the 9.1 deployment; the new runtime FQDN is an internal endpoint. Because users, integrations, and saved Automation workflows continue to use the same front-end address, they do not need to be rebuilt or repointed after the migration. The blue-green design minimizes disruption, although I would still avoid scheduling critical in-flight workflow executions during the final cutover and validation period.

After migration, validate cloud accounts, regions, projects, quotas, namespaces, identity, and one representative provisioning workflow.

### VCF Operations for Logs is not the new Log Management deployment

An existing **VCF Operations for Logs** deployment does not become 9.1 **Log Management** in place. Log Management is a separate Management Services deployment with a new DNS-backed VIP/FQDN. In our case, it was one of the last steps because we were waiting for that record.

Reserve a record such as `vcf-logs-01.example.com` with forward and reverse resolution and include it in the certificate SAN. Do not reuse the Operations FQDN or assume the old Operations for Logs name satisfies the prompt. Additional Log Management VIPs also need SAN entries. Finish other optional products in the planner's order and confirm each one joins Fleet inventory.

Existing logs do not have to be abandoned. After deploying Log Management 9.1, use the supported **Transfer Log Data** workflow to move data from the existing VCF Operations for Logs instance into the new Log Management deployment. Broadcom includes this transition in its [VCF 9.1 upgrade guidance](https://blogs.vmware.com/cloud-foundation/2026/06/18/how-to-upgrade-to-vmware-cloud-foundation-9-1/). Plan the transfer separately from deploying the new service, and validate retention, available capacity, and access to historical searches afterward.

## What I Would Carry into the Next Upgrade

My most useful artifact was a control sheet containing the planner order, FQDNs and addresses, certificate SANs, Management Services and Automation ranges, latency results, prerequisite owners, and a validation gate for each phase. I would not carry an unexplained lock, missing Fleet component, certificate mismatch, or failed provider connection into the next phase.

VCF 9.1 brings useful capabilities after the lifecycle work is finished. VCF Networking Automation adds services for distributed VPCs, including distributed Transit Gateway connectivity for Supervisor and Automation, a VNA-backed Layer 4 load balancer, and VPC VLAN extension. VKS and VM Fast-Deploy can use linked clones, and namespace consumption is more streamlined for self-service Kubernetes. Eligible TPM-backed hosts can also use live ESX patching for supported patches. Broadcom summarizes those additions in [VCF 9.1 What's New](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/release-notes/vmware-cloud-foundation-9-1-0-0-release-notes/what-s-new.html).

Accurate DNS, sufficient addresses, measured latency, clean inventory, valid certificates, and a check after each dependency changed kept the upgrade predictable.

## References Used During the Upgrade

- [VCF Upgrade Planner: VCF 9.0 to 9.1 with VCF Automation](https://vmware.github.io/vcf-upgrade-planner/VCF-9.0-to-VCF-9.1-(VCF-Automation-included).html)
- [VMware Cloud Foundation 9.1: What's New](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/release-notes/vmware-cloud-foundation-9-1-0-0-release-notes/what-s-new.html)
- [Broadcom: How to Upgrade to VMware Cloud Foundation 9.1](https://blogs.vmware.com/cloud-foundation/2026/06/18/how-to-upgrade-to-vmware-cloud-foundation-9-1/)
- [KB 440630: VCF 9.1 upgrade sequence and related issues](https://knowledge.broadcom.com/external/article/440630/upgrade-sequence-and-related-issues-for.html)
- [VCF 9.1 security and Identity Broker enhancements](https://blogs.vmware.com/cloud-foundation/2026/05/05/platform-security-vcf-9-1/)
- [KB 441285: Identity Broker 9.0.x-to-9.1 upgrade failure scenarios](https://knowledge.broadcom.com/external/article/441285/vcf-identity-broker-upgrade-from-vcf-90x.html)
- [KB 444734: Transition an Identity Broker appliance to the Management Services environment](https://knowledge.broadcom.com/external/article/444734/transition-a-vcf-identity-broker-90x-ins.html)
- [KB 440282: VCF 9.1 upgrade binaries do not appear in VCF Operations 9.0](https://knowledge.broadcom.com/external/article/440282/vcf-91-upgrade-binaries-do-not-show-up-i.html)
- [KB 428018: Access the VCF Operations admin UI and upload a product PAK](https://knowledge.broadcom.com/external/article/428018/vcf-operations-appliance-update-with-vv.html)
- [KB 431008: Select the correct VCF Operations product-upgrade PAK](https://knowledge.broadcom.com/external/article/431008/version-remains-unchanged-in-vmware-aria.html)
- [KB 425089: Required component binaries for a VCF 9.1 upgrade](https://knowledge.broadcom.com/external/article/425089/required-component-binaries-for-vcf-91.html)
- [Broadcom TechDocs: VCF Management Services](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/deployment/vcf-management-appliances.html#GUID-2bab6de2-024a-4900-9716-7fba53ea0721-en_id-e0fe7eb4-1875-4819-dca9-c34434b2d173)
- [KB 440223: VCF Management Services IP selection](https://knowledge.broadcom.com/external/article/440223/vcf-91-vmsp-cluster-deployment-fails-due.html)
- [KB 440541: Management Services deployment and internal CIDR overlap](https://knowledge.broadcom.com/external/article/440541/deploying-vcf-91-fails-at-deploy-and-con.html)
- [VCF 9.1 licensing architecture and automated license workflow](https://blogs.vmware.com/cloud-foundation/2026/05/18/vcf-9-1-licensing-programmatic-centralized-and-built-to-scale/)
- [KB 437242: Getting started with VCF or VVF 9 licensing](https://knowledge.broadcom.com/external/article/437242/getting-started-with-vmware-cloud-founda.html)
- [KB 441526: License Server Docker network conflict with 172.17.0.0/16](https://knowledge.broadcom.com/external/article/441526/vcf-91-license-server-console-displays-a.html)
- [KB 447737: Insufficient licensing capacity blocks an ESX upgrade precheck](https://knowledge.broadcom.com/external/article/447737/the-current-vcenter-is-not-licensed-by-a.html)
- [KB 412252: Maximum network latency guidance in VCF 9.x](https://knowledge.broadcom.com/external/article/412252/clarification-on-maximum-network-latency.html)
- [KB 439473: SDDC Manager health check fails with resource lock errors](https://knowledge.broadcom.com/external/article/439473/sddc-manager-health-check-fails-with-res.html)
- [KB 441858: Import into Fleet Lifecycle fails or completes with warnings](https://knowledge.broadcom.com/external/article/441858/import-vcf-operations-in-fleet-lifecycle.html)
- [KB 424807: Certificate requirements for VCF Operations for Networks](https://knowledge.broadcom.com/external/article/424807/certificate-requirements-for-vcf-operati.html)
- [KB 440459: Operations for Networks Fleet import fails when certificate SANs are incomplete](https://knowledge.broadcom.com/external/article/440459)

Always confirm that a KB and its remediation apply to the exact VCF build and task state before using it.
