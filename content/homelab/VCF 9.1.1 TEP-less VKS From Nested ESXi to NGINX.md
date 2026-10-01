+++
title = "VCF 9.1.1 in My Homelab: From Nested ESXi to a VKS Application in the Browser"
date = "2026-10-01"
draft = false
slug = "vcf-9-1-1-tepless-vks-nested-esxi-to-nginx"
author = "Devyn Harrington"
description = "My complete VCF 9.1.1 TEP-less VLAN-backed VPC rebuild: three nested ESXi hosts, Large VNA recovery, Medium Supervisor, VKS, persistent storage, MikroTik DNS, and NGINX in the browser."
images = ["/images/vcf/vcf-9-1-1-tepless-vks/s23-vcf-deployment-completed-successfully.png"]
hideFeatureImage = true
keywords = ["VCF 9.1.1", "TEP-less VPC", "VLAN-backed VPC", "VKS", "AMD Ryzen VNA", "MikroTik DNS", "nested ESXi"]
tags = ["VCF", "VMware Cloud Foundation", "Home Lab", "Nested ESX", "NSX", "VNA", "vSphere Supervisor", "VKS", "Kubernetes"]
categories = ["Home Lab"]
showDate = true
showReadingTime = true
showWordCount = false
showTableOfContents = true
technicalWalkthrough = true
enableCodeCopy = true
+++

I deployed VMware Cloud Foundation (VCF) 9.1.1 on three nested ESXi hosts running on a single Minisforum MS-A2, then used vSphere Kubernetes Service (VKS) to run NGINX and access it from my Mac. This walkthrough covers the deployment, networking, storage validation, and fixes along the way.

**William Lam’s work provided the foundation.** I followed his [TEP-less VLAN-backed VPC walkthrough](https://williamlam.com/2026/09/vcf-9-1-1-simplified-vsphere-kubernetes-service-vks-using-vlan-backed-vpcs-without-nsx-tunnel-endpoints-teps.html) and [nested VCF deployment guide](https://williamlam.com/2026/05/vcf-9-1-automated-vmware-cloud-foundation-vcf-vmware-vsphere-foundation-vvf-nested-lab-deployment.html), adapting his [upstream automation scripts](https://github.com/lamw/vcf-fleet-automated-lab-deployment) for my Ryzen hardware and network.

## 1. Understand the design and prepare the lab

The lab uses a VLAN-backed **VPC** (Virtual Private Cloud) for workload networking. A **DTGW** (Distributed Transit Gateway) connects it to the external network, and a **VNA** (Virtual Network Appliance) provides network services. Both remain part of the TEP-less design.

The **Supervisor** provides the vSphere-integrated Kubernetes control plane. **VKS** provisions the guest Kubernetes cluster that runs the applications. Its nodes use subnets allocated from a **Public SubnetSet** in the namespace.

**TEP-less** means the ESXi hosts do not need Tunnel Endpoint IPs; their TEP assignment was `NO_IP`. The guest cluster uses **Antrea** for pod networking. Antrea supports [multiple traffic modes](https://antrea.io/docs/main/docs/noencap-hybrid-modes/), and I did not verify which was active, so TEP-less does not imply overlay-free pod networking.

<figure class="lab-topology">
  <a class="lab-topology-light" href="/images/vcf/vcf-9-1-1-tepless-vks/lab-topology-light.svg" aria-label="Open the lab architecture diagram at full size">
    <img class="nozoom" src="/images/vcf/vcf-9-1-1-tepless-vks/lab-topology-light.svg" alt="Lab architecture: MikroTik connects to three nested ESXi hosts on one Minisforum MS-A2, with VCF management, Supervisor, and VKS. The Mac browser reaches NGINX through the LoadBalancer at 10.1.35.34." />
  </a>
  <a class="lab-topology-dark" href="/images/vcf/vcf-9-1-1-tepless-vks/lab-topology-dark.svg" aria-label="Open the lab architecture diagram at full size">
    <img class="nozoom" src="/images/vcf/vcf-9-1-1-tepless-vks/lab-topology-dark.svg" alt="Lab architecture: MikroTik connects to three nested ESXi hosts on one Minisforum MS-A2, with VCF management, Supervisor, and VKS. The Mac browser reaches NGINX through the LoadBalancer at 10.1.35.34." />
  </a>
</figure>

The diagram shows logical relationships; application traffic does not pass through the Supervisor. The outer vCenter manages the nested infrastructure; the nested vCenter manages the VCF domain.

| Foundation | My recorded configuration |
|---|---|
| Physical computer | One Minisforum MS-A2; AMD Ryzen 9 9955HX |
| Physical memory | 128 GB DRAM; NVMe Memory Tiering already configured |
| Router | MikroTik RB5009 |
| Outer vCenter | `vc01.lab.devynharrington.com` |
| Outer cluster / datastore | `Lab-Cluster` / `nested-vcf` |
| Nested hosts | `nested-esx01`, `nested-esx02`, `nested-esx03` |
| Host management | `192.168.88.41`, `.42`, `.43`; `/24` |
| Per-host configured resources | 24 vCPU, 128 GB memory |
| Recorded per-host virtual disks | 32 GB cache VMDK; 3000 GB capacity VMDK |
| Installer | `inst01.vcf.lab.devynharrington.com`; `192.168.88.50` |
| Management gateway / DNS | `192.168.88.1` |
| DNS suffix / NTP | `vcf.lab.devynharrington.com` / `time.google.com` |
| Nested vCenter | `vc01.vcf.lab.devynharrington.com` |
| Nested datacenter / cluster | `vcf-mgmt-dc` / `vcf-mgmt-cl01` |
| External workload network | VLAN `2006`; `10.1.35.0/24`; gateway `10.1.35.1` |

The router interface `vlan2006-external` uses `10.1.35.1/24`. Use the same gateway CIDR for the transit gateway’s external connection and `10.1.35.0/24` for the External IP Block.

The outer inventory reported approximately 628 GB of tiered capacity, **not physical DRAM**. All three nested hosts share the physical host’s CPU, memory, storage, and failure domain. The cache/capacity labels above come from the deployment script, not general vSAN ESA sizing guidance.

My [earlier physical-host and VCF article](/homelab/deploying-a-complete-vcf-9-1-management-domain-nested-esxi-nsx-recovery-and-automation/) covers the existing foundation. Its six-host topology, Automation deployment, and JSON bring-up are a different build. Here I retained the physical host, outer vCenter, datastore, router, and local assets, then rebuilt the three-host nested domain.

### Prerequisites to check before starting

The [upstream repository](https://github.com/lamw/vcf-fleet-automated-lab-deployment) calls for an outer vCenter-managed environment, PowerShell Core/PowerCLI, the nested ESXi and Installer OVAs, an entitled software source, and networking that permits nested guests.

| Requirement | What to prepare or verify |
|---|---|
| Software access | Entitlement to the VCF binaries and an online or offline depot. For 9.1, the documented online workflow registers a Software Depot ID in VCF Business Services and returns an Activation Code. |
| Local tools | PowerShell (`pwsh`) and compatible PowerCLI; `vcf` and `kubectl` for later access; SSH for RouterOS. |
| Nested virtualization | Outer ESXi must expose hardware virtualization to the nested hosts and have enough storage and memory to run the appliances. |
| Outer networking | A management path and a trunk path allowing the required nested MAC addresses and VLANs. Use MAC Learning or promiscuous mode as appropriate to the outer switch, and enable forged transmits with either choice. |
| DNS and time | Unique appliance FQDNs, working forward/reverse DNS as required by the Installer, reachable gateways and NTP, and client access to both management and external networks. |
| Storage | Space on `nested-vcf` for the nested VMDKs and on nested `vsanDatastore` for management appliances, libraries, and guest VMs. Thin provisioned capacity is not a reservation of physical free space. |
| Supervisor readiness | vSphere HA enabled and relevant cluster/vSAN health prerequisites checked before activation. |

The [Broadcom PowerCLI guide](https://developer.broadcom.com/powercli/installation-guide) recommends PowerShell 7.4 or later and the `VCF.PowerCLI` module. Review the [VCF 9.1 depot activation article](https://knowledge.broadcom.com/external/article/443647/download-token-has-been-replaced-by-acti.html) and [Cloud Proxy DNS prerequisite article](https://knowledge.broadcom.com/external/article/444294/cloud-proxy-91-deployment-fails-with-err.html) before bring-up.

Use your own domain, IPs, datastore and cluster names, port groups, and local paths. Generated names and allocated addresses will vary by deployment.

## 2. Deploy the nested hosts and Installer from PowerShell

I worked in `~/VCF91-Lab` on the Mac with the following scripts and OVAs:

| Asset | Local filename |
|---|---|
| Customized deployment driver | `vcf-automated-fleet-deployment-9.1.1-tepless.ps1` |
| Customized environment settings | `devyn-vcf-9.1.1-tepless-no-automation-3tb.ps1` |
| Supporting local test script | `Test-DevynVCF911TeplessJson.ps1` |
| Nested ESXi OVA | `Nested_ESXi9.1.0.0_Appliance_Template_v1.0.ova` |
| Installer appliance OVA | `VCF-SDDC-Manager-Appliance-9.1.1.0.25713928.ova` |

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s03-deployment-assets-on-the-mac.png" alt="Deployment assets on the Mac. Finder shows the customized TEP-less scripts, environment file, OVAs, logs, and earlier generated JSON." caption="Figure S03. Deployment scripts and OVAs in ~/VCF91-Lab." width="1000px" height="auto" variant="technical" >}}

Start with William’s [repository](https://github.com/lamw/vcf-fleet-automated-lab-deployment) and adapt its sample configuration to your environment. The filenames and `-Phase Infrastructure` parameter below belong to my customized scripts.

**Mac terminal — zsh, then enter PowerShell:**

```bash
cd ~/VCF91-Lab
pwsh
```

**PowerShell on the Mac — recorded local Infrastructure phase:**

```powershell
./vcf-automated-fleet-deployment-9.1.1-tepless.ps1 `
  -EnvConfigFile ./devyn-vcf-9.1.1-tepless-no-automation-3tb.ps1 `
  -Phase Infrastructure
```

The PowerShell backtick continues a line; do not put spaces after it. The **Infrastructure** phase prepared the nested hosts and Installer. The subsequent management-domain deployment was performed through the Installer UI.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s05-infrastructure-phase-configuration-summary.png" alt="Infrastructure phase configuration summary. Three nested hosts, 24 vCPU, 128 GB, 3000 GB capacity disks, no Day-0 Automation, NO_IP TEP mode, and HCL bypass are shown." caption="Figure S05. Infrastructure phase configuration summary. Three nested hosts, 24 vCPU, 128 GB, 3000 GB capacity disks, no Day-0 Automation, NO_IP TEP mode, and HCL bypass are shown." width="1000px" height="auto" variant="technical" >}}

Before accepting the script's Y/N prompt, I checked VCF `9.1.1.0`, three hosts, 24 vCPU/128 GB each, 32 GB cache and 3000 GB capacity VMDKs, Day-0 Automation **DISABLED**, and TEP assignment **NONE** with `overlayVtepSpec.vtepType = NO_IP`. The summary also enabled the nested-lab vSAN ESA HCL auto-disk-claim exception. The Installer review later calls this **Allow auto claim of HCL incompatible disks**. It is a lab accommodation, not a statement of supported physical hardware.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h003-nested-host-installer-prerequisites-complete.png" alt="the Infrastructure phase powers on three nested hosts, adds vmnic2/vmnic3 on VCF-Trunk, and reports the Installer ready" caption="Figure H003. The Infrastructure phase powers on three nested hosts, adds vmnic2/vmnic3 on VCF-Trunk, and reports the Installer ready. The footer shows VCF 9.1.0; this deployment used 9.1.1, as shown in Figure S05." width="1000px" height="auto" variant="technical" >}}

I recreated the nested lab and reinstalled the 9.1.1 binaries before the successful rebuild.

**Checkpoint:** in the outer vCenter, verify the three nested hosts and `inst01`, including their networks and configured resources. Confirm access to `https://inst01.vcf.lab.devynharrington.com` and prepare the entitled 9.1.1 binaries before starting the fleet wizard.

## 3. Complete the successful VCF Installer UI workflow

I opened the Installer, chose **Deploy a new VCF fleet**, and used the new-management-domain path without existing components.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h006-installer-new-vcf-fleet.png" alt="choose Deploy a new VCF fleet" caption="Figure H006. Choose Deploy a new VCF fleet." width="1000px" height="auto" variant="technical" >}}

In **Plan**, I selected the **Simple** deployment model and **Small** deployment size. The selection below shows the settings used for the successful rebuild.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s21-successful-rebuild-selects-simple-model.png" alt="Successful rebuild selects Simple model. Simple deployment model and Small size are selected; the component sizing preview includes Medium NSX." caption="Figure S21. Successful rebuild selects Simple model. Simple deployment model and Small size are selected; the component sizing preview includes Medium NSX." width="1000px" height="auto" variant="technical" >}}

### Select VLAN-backed VPC in Network Options

In **Plan → Network Options**, click **Customize**. Under **VPC Network Configuration**, change **Full Stack VPC** to **VLAN backed VPC**.

<!-- Screenshot source: https://williamlam.com/wp-content/uploads/2026/08/vcf-9.1.1-enhancements-5.png -->
{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/installer-vlan-backed-vpc-selection.png" alt="VCF Installer Network Options with VLAN backed VPC selected and highlighted under VPC Network Configuration." caption="Select VLAN backed VPC under VPC Network Configuration." width="1000px" height="auto" variant="technical" zoomFill="true" >}}

The Distributed and Centralized gateway choices disappear when **VLAN backed VPC** is selected. Confirm this selection before clicking **Next**. It sets the host TEP configuration to `overlayVtepSpec.vtepType = NO_IP`; the external VLAN, gateway, IP block, and VNA are configured after deployment in section 5.

### General information and host entry

In **Prepare**, I entered the following values. This table follows the final review, so it supersedes earlier default screens.

| Field | Successful value |
|---|---|
| Version | `9.1.1.0` |
| VCF instance | `Devyn VCF 9.1.1 Lab - TEP-Less VLAN-Backed VPC` |
| Management domain | `vcf-m01` |
| CEIP | No |
| Default hostname DNS suffix | `vcf.lab.devynharrington.com` |
| DNS / NTP | `192.168.88.1` / `time.google.com` |
| Autogenerate passwords | Unchecked; chosen passwords entered manually |
| Day-0 Automation | Disabled |
| Hosts | `nested-esx01.vcf.lab.devynharrington.com`, `nested-esx02.vcf.lab.devynharrington.com`, `nested-esx03.vcf.lab.devynharrington.com` |

<details>
<summary>General Information form before final settings</summary>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s06-prepare-general-information.png" alt="General Information form with CEIP and autogenerated passwords selected before final settings." caption="Figure S06. Initial form with CEIP and autogenerated passwords selected; both were unchecked in the final configuration." width="1000px" height="auto" variant="technical" >}}

</details>

For each host, enter its current root password and verify the presented certificate fingerprint against the host. Rebuilding a host creates a new certificate, so do not reuse a previous deployment’s thumbprint.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h049-installer-host-certificate-review.png" alt="Installer review lists the three host FQDNs and confirmed certificate fingerprints" caption="Figure H049. Installer review lists the three host FQDNs and confirmed certificate fingerprints. Root passwords remain masked in the source image." width="1000px" height="auto" variant="technical" >}}

### Networks and the management-services address pool

Enter the ESX, VM, and VCF management networks, then the vMotion and vSAN networks. Keep the management-services pool separate from the external workload block.

| Network | VLAN | CIDR / gateway | Address range / MTU |
|---|---|---|---|
| ESX Management | `0` | `192.168.88.0/24` / `192.168.88.1` | Existing host addresses; no separate MTU shown in review |
| VM Management | `0` | `192.168.88.0/24` / `192.168.88.1` | Management appliance network |
| VCF Management | Inherit | Use same inputs from VM Management Network | Inherit |
| VCF Management Services pool | Inherit | Management subnet | `192.168.88.193–192.168.88.222` |
| vMotion | `0` | `10.1.32.0/24` / `10.1.32.1` | `10.1.32.101–10.1.32.118`; MTU `9000` |
| vSAN | `0` | `10.1.33.0/24` / `10.1.33.1` | `10.1.33.101–10.1.33.118`; MTU `9000` |

I selected **Single IPv4 range** for the 30-address management-services pool listed above; the form required at least 12. The DHCP pool ended at `.191`. The VNA and Supervisor floating addresses, `.90` and `.91`, were outside both pools.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s07-management-services-address-pool-form.png" alt="Management services address pool form. Single IPv4 range selected before entering 192.168.88.193–192.168.88.222; minimum 12 IPs displayed." caption="Figure S07. Management services address pool form. Single IPv4 range selected before entering 192.168.88.193–192.168.88.222; minimum 12 IPs displayed." width="1000px" height="auto" variant="technical" >}}

VLAN `0` applies to these nested networks. The external workload network uses VLAN `2006`.

### Operations, Cloud Proxy, and management services

| UI field | Successful value |
|---|---|
| Operations size / primary node | Small / `ops01.vcf.lab.devynharrington.com` |
| Cloud Proxy size / FQDN | Small / `vcf-proxy01.vcf.lab.devynharrington.com` |
| License Server | `vcf-lic01.vcf.lab.devynharrington.com` |
| VCF services runtime | `vcf-msr01.vcf.lab.devynharrington.com` |
| Instance components | `vcf-int01.vcf.lab.devynharrington.com` |
| Fleet components | `vcf-flt01.vcf.lab.devynharrington.com` |
| Identity Broker | `vcf-idb01.vcf.lab.devynharrington.com` |
| Management-services size / name | Small / `vcf-m01-vmsp-01` |
| Internal cluster CIDR IPv4 | `198.18.0.0/15` |

Enter the corresponding root, administrator, and system-user passwords in the wizard.

### Nested vCenter, storage, and distributed switch

| UI field | Successful value |
|---|---|
| vCenter | `vc01.vcf.lab.devynharrington.com` |
| Appliance size / appliance storage size | Small / Large |
| Datacenter / cluster | `vcf-mgmt-dc` / `vcf-mgmt-cl01` |
| SSO domain | `vsphere.local` |
| Storage | vSAN ESA |
| Allow auto claim of HCL incompatible disks | Yes, for this nested lab |
| Datastore | `vsanDatastore` |
| Data-in-Transit encryption | No |
| VDS | `vcf-mgmt-cl01-vds01` |
| VDS MTU / uplink type / count | `9000` / VDS Uplinks / `2` |
| Installer NIC mapping | `vmnic0 → uplink1`; `vmnic1 → uplink2` |

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h035-installer-distributed-switch-profile.png" alt="the Distributed Switch page offers a default single-switch profile and other profiles below it" caption="Figure H035. Distributed Switch profile selection, including the default single-switch profile." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s08-initial-distributed-switch-nic-choices.png" alt="Initial distributed switch NIC choices. The form initially shows vmnic0 and vmnic1; the later attempted vmnic2/vmnic3 change triggered validation." caption="Figure S08. Initial distributed switch NIC choices. The form initially shows vmnic0 and vmnic1; the later attempted vmnic2/vmnic3 change triggered validation." width="1000px" height="auto" variant="technical" >}}

I kept the Installer mapping on `vmnic0/vmnic1`. The trunk migration comes **after deployment**, as section 4 explains.

| Traffic | Port group | Load balancing | Active uplinks |
|---|---|---|---|
| ESX Management | `vcf-mgmt-cl01-vds01-pg-esx-mgmt` | Route Based on Physical NIC Load | `uplink1`, `uplink2` |
| VM Management | `vcf-mgmt-cl01-vds01-pg-vm-mgmt` | Route Based on Physical NIC Load | `uplink1`, `uplink2` |
| vMotion | `vcf-mgmt-cl01-vds01-pg-vmotion` | Route Based on Physical NIC Load | `uplink1`, `uplink2` |
| vSAN | `vcf-mgmt-cl01-vds01-pg-vsan` | Route Based on Physical NIC Load | `uplink1`, `uplink2` |

### NSX, SDDC Manager, validation, and completion

The **VLAN backed VPC** selection made in **Plan → Network Options** is retained in the saved configuration as `vtepType: NO_IP`.

| UI field | Successful value |
|---|---|
| NSX operational mode | Apply the default virtual switch mode configured in NSX Manager |
| Overlay transport-zone name retained in review | `overlay-tz-mgmt-nsxt` |
| NSX Manager size | Medium |
| NSX appliance / cluster FQDN | `nsx01a.vcf.lab.devynharrington.com` / `nsx01.vcf.lab.devynharrington.com` |
| NSX addresses observed later | Node `192.168.88.61`; cluster VIP `192.168.88.60` |
| SDDC Manager | `sddcm01.vcf.lab.devynharrington.com` |
| VCF Installer Deployment | New SDDC Manager Deployment |

The overlay transport-zone name remains in the review even though host TEP IPs are not assigned. Enter the NSX root/admin/audit and SDDC Manager root/VCF/admin credentials, review the specification, and run validation. Resolve any errors before starting deployment. Keep exported specifications private because they can contain credentials.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s22-second-deployment-starts.png" alt="Second deployment starts. The successful Installer run begins at the vCenter stage with the corrected starting NIC mapping in its review." caption="Figure S22. Second deployment starts. The successful Installer run begins at the vCenter stage with the corrected starting NIC mapping in its review." width="1000px" height="auto" variant="technical" >}}

The Installer reported a successful deployment:

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s23-vcf-deployment-completed-successfully.png" alt="VCF deployment completed successfully. The Installer displays its success banner." caption="Figure S23. VCF deployment completed successfully. The Installer displays its success banner." width="1000px" height="auto" variant="technical" >}}

About **5 hours 43 minutes** elapsed between the deployment-start and completion screenshots in my nested lab. Confirm the green stage results and success banner before continuing to postdeployment networking.

## 4. Move the completed VDS onto the outer trunk adapters

The Installer used `vmnic0/vmnic1`. After deployment, I moved the VDS uplinks to the outer-trunk-backed `vmnic2/vmnic3` adapters for the VLAN-backed workload network.

My earlier attempt to specify `vmnic2/vmnic3` too soon failed **ESX Host Configuration** validation: `vmnic0` was attached to `vSwitch0`, but was missing from the input specification. That is why I retained `vmnic0/vmnic1` during the successful Installer run.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s09-esx-host-configuration-validation-failure.png" alt="ESX Host Configuration validation failure. All three hosts report vmnic0 attached to vSwitch0 but missing from the vmnic2/vmnic3 input specification." caption="Figure S09. ESX Host Configuration validation failure. All three hosts report vmnic0 attached to vSwitch0 but missing from the vmnic2/vmnic3 input specification." width="1000px" height="auto" variant="technical" >}}

In **outer vCenter → VM → Edit Settings**, I checked each nested host’s extra adapters were connected to **VCF-Trunk**, configured with VLAN **4095**. Match adapter MAC addresses to the nested host’s physical-adapter inventory to confirm the mapping.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h148-outer-vcf-trunk-vlan-4095.png" alt="the outer VCF-Trunk port group is configured for All (4095), allowing the nested hosts to carry tagged VLANs" caption="Figure H148. VCF-Trunk uses All (4095), allowing the nested hosts to carry tagged VLANs." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h162-outer-nested-vm-trunk-adapters.png" alt="virtual network adapters 3 and 4 are connected to VCF-Trunk" caption="Figure H162. Virtual network adapters 3 and 4 are connected to VCF-Trunk. Verify this backing before migrating the nested distributed-switch uplinks." width="1000px" height="auto" variant="technical" >}}

The [Broadcom nested-VLAN reference](https://knowledge.broadcom.com/external/article/440372/virtual-switch-portgroup-configuration-f.html) distinguishes outer switch types: VLAN 4095 is the standard-port-group virtual guest tagging setting; a distributed port group instead uses VLAN Trunking with an allowed range. Permit VLAN 2006 across the actual path and retain the management/storage connectivity required by the nested hosts.

In the **nested vCenter → Networking → `vcf-mgmt-cl01-vds01` → Add and Manage Hosts**, I selected the nested hosts and managed their physical adapters.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s24-postdeployment-physical-adapter-management.png" alt="Postdeployment physical adapter management. Add and Manage Hosts shows vmnic0/vmnic1 in use and vmnic2/vmnic3 available before trunk migration." caption="Figure S24. Postdeployment physical adapter management. Add and Manage Hosts shows vmnic0/vmnic1 in use and vmnic2/vmnic3 available before trunk migration." width="1000px" height="auto" variant="technical" >}}

| Nested adapter | During Installer | Target after deployment |
|---|---|---|
| `vmnic0` | `uplink1`, outer VM Network | Unassigned from this VDS |
| `vmnic1` | `uplink2`, outer VM Network | Unassigned from this VDS |
| `vmnic2` | Available, outer VCF-Trunk | `uplink1` |
| `vmnic3` | Available, outer VCF-Trunk | `uplink2` |

Apply changes deliberately, preserving a verified working path while migrating a host. Review the wizard's impact and keep console access available. Do not detach all working adapters at once or assign the same host's uplink to two adapters. After each host, verify management reachability and storage networking before proceeding.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h181-all-hosts-trunk-uplink-mapping.png" alt="the final topology shows vmnic2 under uplink1 and vmnic3 under uplink2 for all three nested hosts" caption="Figure H181. Final mapping on all three nested hosts: vmnic2 under uplink1 and vmnic3 under uplink2." width="1000px" height="auto" variant="technical" >}}

I completed the trunk correction during the rebuild. Figure S24 shows the starting state; Figure H181 illustrates the final mapping from a previous deployment.

## 5. Configure the transit gateway, external block, and Large VNA

With VCF up and the trunk path corrected, I rechecked the router's `/24`.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s25-recheck-the-router-before-vpc-networking.png" alt="Recheck the router before VPC networking. Gateway 10.1.35.1/24 and connected route 10.1.35.0/24 remain in place." caption="Figure S25. Recheck the router before VPC networking. Gateway 10.1.35.1/24 and connected route 10.1.35.0/24 remain in place." width="1000px" height="auto" variant="technical" >}}

In **nested vCenter → Network → Networks → Transit Gateways**, click **Set Up Network Connectivity** to begin.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h067-transit-gateway-setup-network-connectivity.png" alt="Transit Gateways landing page with the Set Up Network Connectivity button beneath Let's Get Started." caption="Figure H067. Start the transit-gateway workflow with Set Up Network Connectivity." width="1000px" height="auto" variant="technical" >}}

The prerequisite screen calls for the external VLAN path and disabling ICMP redirects on its gateway. I verified the intended VLAN connectivity, then applied the recorded RouterOS setting.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s26-dtgw-networking-prerequisites.png" alt="DTGW networking prerequisites. Dedicated VLAN access, ICMP redirect behavior, and external IP block prerequisites are acknowledged." caption="Figure S26. DTGW networking prerequisites. Dedicated VLAN access, ICMP redirect behavior, and external IP block prerequisites are acknowledged." width="1000px" height="auto" variant="technical" >}}

**MikroTik RouterOS terminal — disable and verify ICMP redirects:**

```routeros
/ip/settings/set send-redirects=no
/ip/settings/print
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s27-disable-mikrotik-icmp-redirects.png" alt="RouterOS output verifies send-redirects=no after disabling ICMP redirects." caption="Figure S27. RouterOS confirms send-redirects=no." width="1000px" height="auto" variant="technical" >}}

In **External Network Connectivity**, enter VLAN `2006` and gateway CIDR `10.1.35.1/24`. Add the block in the same workflow:

| Field | Submitted value |
|---|---|
| External IP Block | `VCF-External-IP-Block` |
| Visibility | External |
| CIDR | `10.1.35.0/24` |
| Additional IP ranges | Blank |
| Excluded range | `10.1.35.1–10.1.35.1` |
| Reserved for Specific Subnet | No |
| Description | VLAN 2006 external network for TEP-less VPCs |

<details>
<summary>External-connection and IP-block entry forms</summary>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s28-external-network-connectivity-form.png" alt="External network connectivity form. The form requests VLAN, gateway CIDR, and VPC external blocks before their values are entered." caption="Figure S28. External network connectivity form. The form requests VLAN, gateway CIDR, and VPC external blocks before their values are entered." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s29-add-the-external-ip-block.png" alt="Add the external IP block. Initial blank block dialog; visibility External and reservation controls are visible." caption="Figure S29. Add the external IP block. Initial blank block dialog; visibility External and reservation controls are visible." width="1000px" height="auto" variant="technical" >}}

</details>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s30-final-external-ip-block-values.png" alt="Final external IP block values. VCF-External-IP-Block uses 10.1.35.0/24 and excludes only the router address 10.1.35.1; no specific-subnet reservation." caption="Figure S30. Final external IP block values. VCF-External-IP-Block uses 10.1.35.0/24 and excludes only the router address 10.1.35.1; no specific-subnet reservation." width="1000px" height="auto" variant="technical" >}}

The gateway field uses the **host address**, `10.1.35.1/24`; the block uses the **network**, `10.1.35.0/24`. Exclude the router address and any other reserved addresses from allocation.

The transit gateway provides the external connection; the VPC connectivity profile links the VPC to the external IP block and services. My Supervisor used the **Default** NSX project and **Default VPC Connectivity Profile**. Verify that profile references this `/24` block before enabling Supervisor.

### Submit the VNA configuration

On **VPC Services**, configure the VNA cluster and add its node.

| VNA setting | Recorded value |
|---|---|
| Cluster / node | `vcf-m01-vna-cl01` / `vna01` |
| Form factor / node count | **Large** / **one** |
| Placement | `vcf-mgmt-cl01`; default cluster resource pool |
| Datastore | `vsanDatastore` |
| Host group affinity | No |
| Management port group | `vcf-mgmt-cl01-vds01-pg-vm-mgmt` |
| Management address | `192.168.88.90` on `192.168.88.0/24` |
| Gateway / DNS | `192.168.88.1` / `192.168.88.1` |
| Planned FQDN | `vna01.vcf.lab.devynharrington.com` |

<details>
<summary>Intermediate VNA forms: Medium and DHCP are initial defaults</summary>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s31-vpc-services-and-vna-cluster-form.png" alt="VPC Services and VNA cluster form. Initial VNA service page; Medium is a default here, later changed to Large in the submitted review." caption="Figure S31. VPC Services and VNA cluster form. Initial VNA service page; Medium is a default here, later changed to Large in the submitted review." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s32-vna-add-node-form.png" alt="VNA Add Node form. Unfilled node form with DHCP selected by default; this screen does not establish the final assignment mode." caption="Figure S32. VNA Add Node form. Unfilled node form with DHCP selected by default; this screen does not establish the final assignment mode." width="1000px" height="auto" variant="technical" >}}

</details>

The initial service form showed **Medium**, and the unfilled node form showed **DHCP**. Neither establishes the final submission. The recorded management plan used `.90`; the healthy result later confirms that address. The submitted review conclusively shows **Large**, one node, and the correct external connection:

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s33-network-and-large-vna-deployment-review.png" alt="Network and Large VNA deployment review. Review confirms VLAN 2006, gateway 10.1.35.1/24, VCF-External-IP-Block, vcf-m01-vna-cl01, one node, and Large." caption="Figure S33. Network and Large VNA deployment review. Review confirms VLAN 2006, gateway 10.1.35.1/24, VCF-External-IP-Block, vcf-m01-vna-cl01, one node, and Large." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s34-vna-vm-deployment-begins.png" alt="VNA VM deployment begins. Node vna01 is at 10 percent Deploying VM; the cluster is In Progress." caption="Figure S34. VNA VM deployment begins. Node vna01 is at 10 percent Deploying VM; the cluster is In Progress." width="1000px" height="auto" variant="technical" >}}

Monitor deployment under **Configure → Networking → VNA Clusters**. Figure S34 shows `vna01` at 10% **Deploying VM**.

## 6. Recover VNA root access and apply the Ryzen workaround

The VNA did not deploy successfully on my Ryzen lab without intervention. Deployment stalled at around **51%**, the same symptom I had encountered in the earlier attempt. The VNA hit an AMD **CPU-model validation guard**: the installed Python code rejected an AMD processor unless its model string contained `AMD EPYC`.

To get deployment moving again, I opened `vna01`'s **VM web console** in the nested vCenter, restarted the appliance, and used GRUB password recovery to reset its root password. Once I could log in as root, I applied the `sed` workaround below, verified the change, and rebooted. The recovery steps and commands are shown in order below; the stall near 51% was an observation from my lab.

William's [original Ryzen/NSX Edge article](https://williamlam.com/2020/05/configure-nsx-t-edge-to-run-on-amd-ryzen-cpu.html) explains the guard and workaround. This is an unsupported homelab modification. His [upgrade follow-up](https://williamlam.com/2025/10/quick-tip-workaround-for-nsx-edge-upgrade-to-vcf-9-0-1-running-amd-ryzen-cpus.html) covers changes to file paths and line numbers; upgrades or redeployments can replace the modified file.

### Use the VNA console and GRUB password recovery

1. In the nested vCenter, select **`vna01`**, launch its **VM web console**, and restart the appliance.
2. Hold **left Shift** or press **Esc** during boot to interrupt GRUB. If you miss the menu, restart and try again. Select the boot entry and press **e** to edit.
3. If GRUB authenticates the edit, use its credentials. The documented unchanged default is username **`root`**, password **`NSX@VM!WaR10`**. A changed GRUB password takes precedence. This is **not** the appliance's new root login password.
4. Locate the line beginning with `linux` and move to the end of the **logical line**, even if it wraps across the display. On the Mac, the guidance was Ctrl+E or Fn+Right; confirm the actual cursor position.
5. Append a space and the recovery parameter below.
6. Press **Ctrl+X** to boot. Follow the recovery prompt to set and confirm the appliance root password, then complete boot and log in as root.

**VNA VM console — append to the GRUB `linux` line, not a shell command:**

```text
systemd.wants=PasswordRecovery.service
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s35-grub-password-recovery-parameter.png" alt="GRUB password recovery parameter. The linux boot line ends with systemd.wants=PasswordRecovery.service; Ctrl+X is the boot shortcut." caption="Figure S35. GRUB password recovery parameter. The linux boot line ends with systemd.wants=PasswordRecovery.service; Ctrl+X is the boot shortcut." width="1000px" height="auto" variant="technical" >}}

The parameter and boot workflow are documented in [Broadcom KB 416526](https://knowledge.broadcom.com/external/article/416526/nsxt-manager-root-password-needs-to-be.html) and the [Edge/Manager recovery procedure in KB 316043](https://knowledge.broadcom.com/external/article/316043/nsx-edge-nodes-or-managers-disconnected.html). I reached the VNA root shell through this process. No recovered appliance password is included in this article.

<details>
<summary>Console message about the separate GRUB password</summary>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h086-vna-grub-default-password-message.png" alt="the VNA console reports that setting the GRUB root password failed and says to use the default password" caption="Figure H086. The VNA console reports that setting the GRUB root password failed and says to use the default password. The appliance login prompt is separate from GRUB authentication. Native-resolution crop of the embedded contact sheet; the full-resolution original was not supplied." width="1000px" height="auto" variant="technical" >}}

</details>

### Inspect the installed file before editing

**VNA root shell — advised backup and recorded inspection command:**

```bash
cp -pn /opt/vmware/nsx-edge/bin/config.py \
  /opt/vmware/nsx-edge/bin/config.py.pre-ryzen-workaround

grep -n -A5 -B5 'Unsupported CPU\|AMD EPYC' \
  /opt/vmware/nsx-edge/bin/config.py
```

The backup was advised in the conversation; a separate successful backup result was not captured. Verify that your own backup exists before modifying the file. The inspection was captured and located this guard at **lines 224–225 in my installed build**.

**VNA configuration file — inspected Python excerpt, not a command to execute:**

```python
if "AMD" in vendor_info and "AMD EPYC" not in model_name:
    self.error_exit("Unsupported CPU: %s" % model_name)
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s36-identify-the-amd-cpu-guard.png" alt="Identify the AMD CPU guard. VNA config.py inspection shows the non-EPYC AMD rejection at lines 224–225 on this build." caption="Figure S36. Identify the AMD CPU guard. VNA config.py inspection shows the non-EPYC AMD rejection at lines 224–225 on this build." width="1000px" height="auto" variant="technical" >}}

**VNA root shell — exact recorded edit, verification, and reboot:**

```bash
sed -i '224,225s/^/# /' /opt/vmware/nsx-edge/bin/config.py
sed -n '224,225p' /opt/vmware/nsx-edge/bin/config.py
reboot
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s37-exact-vna-workaround-command.png" alt="Exact VNA workaround command. The sed command comments only lines 224 and 225 of /opt/vmware/nsx-edge/bin/config.py." caption="Figure S37. Exact VNA workaround command. The sed command comments only lines 224 and 225 of /opt/vmware/nsx-edge/bin/config.py." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s38-verify-the-commented-cpu-check.png" alt="Verify the commented CPU check. Both guard lines are prefixed with # after the change." caption="Figure S38. Verify the commented CPU check. Both guard lines are prefixed with # after the change." width="1000px" height="auto" variant="technical" >}}

Do not apply those line numbers blindly to another version. Find the guard in that installed file and confirm that only the intended two lines will be commented. The screenshot shows both lines prefixed with `#`. The first `sed` command changes the file; the second prints the edited lines so you can verify them.

### Wait for the VNA deployment to recover

After applying the workaround and rebooting, I returned to **Configure → Networking → VNA Clusters**. The node briefly showed **L2 Config Failed**, then **In Progress**. I left the deployment running; it reached **Up / Success** after roughly **five minutes**.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s39-vna-recovered-successfully.png" alt="VNA recovered successfully. vcf-m01-vna-cl01 and vna01 are Up and Success; node management IP is 192.168.88.90 and alarms are zero." caption="Figure S39. VNA recovered successfully. vcf-m01-vna-cl01 and vna01 are Up and Success; node management IP is 192.168.88.90 and alarms are zero." width="1000px" height="auto" variant="technical" >}}

With the cluster and node **Up / Success**, I continued. **BFD Sessions: Not Available** remained visible. This lab used a single VNA node.

## 7. Create the two subscribed content libraries

The Supervisor image source and the guest Kubernetes release source serve different consumers. I used separate names and subscriptions:

| Library | Subscription URL | Purpose |
|---|---|---|
| `Supervisor-Subscribed-Library` | `https://wp-content.broadcom.com/supervisor/v1/latest/lib.json` | Supervisor lifecycle images |
| `VKR-Subscribed-Library` | `https://wp-content.broadcom.com/v2/latest/lib.json` | VMware Kubernetes Releases for guest-cluster provisioning |

In **nested vCenter → Content Libraries → Create**, name the library, select the nested vCenter, choose **Subscribed content library**, enter its URL, and select **`vsanDatastore`**. Use automatic synchronization, no authentication for these public subscriptions, and **download content immediately**. Wait for the needed images to finish downloading before using them.

Downloading immediately uses storage and transfer time up front so the images are available locally.

The local Fleet-gateway subscription I tried could not fetch its items in this build:

**Content Library subscription field — local URL that failed in my lab:**

```text
https://vcf-flt01.vcf.lab.devynharrington.com/depot-service/content-gateway/PROD/COMP/VKR/lib.json
```

I used the public VKR subscription instead, which worked in my lab.

[Broadcom's library-association guidance](https://knowledge.broadcom.com/external/article/433761/vcf-operations-unable-to-update-the-sup.html) places the Supervisor image-source association under **Supervisor Management → Content Distribution → Supervisor Images Library**. The [9.1 Supervisor library article](https://knowledge.broadcom.com/external/article/442430/vcf-91-supervisor-content-library-fails.html) confirms the public Supervisor endpoint.

After Supervisor is running, associate **VKR-Subscribed-Library** under **Supervisor → Configure → General → Kubernetes Service**, then make it available through the namespace’s **VM Service / Content Libraries** configuration, as shown in section 10.

## 8. Activate a Medium Supervisor

With the VNA healthy and image sources prepared, I opened **Supervisor Management → Add Supervisor**, chose **VCF Networking with VPC**, and selected the zone containing `vcf-mgmt-cl01`.

| Supervisor setting | Recorded value |
|---|---|
| Name | `vcf-mgmt-supervisor01` |
| Cluster / vCenter | `vcf-mgmt-cl01` / `vc01.vcf.lab.devynharrington.com` |
| Control-plane VM count | One |
| Size | **Medium**; UI showed 8 vCPU, 24 GB memory, 48 GB storage |
| Management assignment | DHCP |
| Management network | `vcf-mgmt-cl01-vds01-pg-vm-mgmt` |
| Management floating IP | `192.168.88.91` |
| Management DNS / search domain | `192.168.88.1` / `vcf.lab.devynharrington.com` |
| Management NTP | `time.google.com` |
| NSX project | Default |
| VPC connectivity profile | Default VPC Connectivity Profile |
| External block | `VCF-External-IP-Block`; `10.1.35.0/24` |
| Workload DNS / NTP | `192.168.88.1` / `time.google.com` |
| API Server DNS Name | `vcf-mgmt-supervisor01.vcf.lab.devynharrington.com` |
| Control-plane, ephemeral, and image storage policies | `vcf-mgmt-cl01 - Optimal Datastore Default Policy - AutoRAID` |

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s40-supervisor-management-networking.png" alt="Supervisor management networking. DHCP management, floating IP 192.168.88.91, DNS 192.168.88.1, and time.google.com are visible." caption="Figure S40. Supervisor management networking. DHCP management, floating IP 192.168.88.91, DNS 192.168.88.1, and time.google.com are visible." width="400px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h109-supervisor-management-portgroup.png" alt="the Supervisor management-network selector highlights vcf-mgmt-cl01-vds01-pg-vm-mgmt." caption="Figure H109. The Supervisor management-network selector highlights vcf-mgmt-cl01-vds01-pg-vm-mgmt." width="1000px" height="auto" variant="technical" >}}

DHCP for the control-plane management configuration and the explicit `.91` floating address are separate fields. Ensure DHCP and routing are available on the selected management network; copying the floating IP alone does not supply them.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s44-supervisor-workload-dns-and-ntp.png" alt="Supervisor Workload Network form with the Default project and connectivity profile, external /24 block, DNS 192.168.88.1, and NTP time.google.com." caption="Figure S44. Workload Network settings: Default project and connectivity profile, /24 external block, DNS 192.168.88.1, and NTP time.google.com." width="1000px" height="auto" variant="technical" >}}

<details>
<summary>Initial Supervisor sizing before my Medium selection</summary>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s42-supervisor-initial-small-default.png" alt="Supervisor initial Small default. Advanced Settings initially shows Small before the deliberate Medium change." caption="Figure S42. Supervisor initial Small default. Advanced Settings initially shows Small before the deliberate Medium change." width="1000px" height="auto" variant="technical" >}}

</details>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s43-supervisor-changed-to-medium.png" alt="Supervisor changed to Medium. Medium 8 vCPU and 24 GB is selected with an API DNS name; the UI warns it cannot later scale down." caption="Figure S43. Supervisor changed to Medium. Medium 8 vCPU and 24 GB is selected with an API DNS name; the UI warns it cannot later scale down." width="1000px" height="auto" variant="technical" >}}

I chose Medium for the planned Kubernetes use. The UI warned that it could not later scale down. Keep these sizes separate: **Simple/Small fleet**, **Large VNA**, **Medium Supervisor**, and later **best-effort-small VKS node VMs**. They size different components.

Review the network, storage, sizing, and endpoint choices and activate the Supervisor. Entering the API DNS name does not itself prove that a DNS A record was created. The resulting API address was `10.1.35.7`; its current DNS answer remains an uncaptured check.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s45-supervisor-activation-begins.png" alt="Supervisor activation begins. The progress dialog shows 1 of 8 conditions complete and control-plane VM configuration starting." caption="Figure S45. Supervisor activation begins. The progress dialog shows 1 of 8 conditions complete and control-plane VM configuration starting." width="1000px" height="auto" variant="technical" >}}

## 9. Follow Supervisor reconciliation through to both Running states

The guest, management-network, and Kubernetes control-plane conditions completed while workload networking and service configuration were still in progress.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s46-control-plane-partly-configured.png" alt="Control plane partly configured. Guest, management network, and Kubernetes control-plane conditions are complete; workload networking is still in progress." caption="Figure S46. Control plane partly configured. Guest, management network, and Kubernetes control-plane conditions are complete; workload networking is still in progress." width="1000px" height="auto" variant="technical" >}}

During reconciliation, I observed the following errors and status changes:

| Observation | What I could conclude |
|---|---|
| NSX trust-management/token-principal-identities request returned HTTP 503 | An NSX/API dependency was failing at that moment. |
| Pinniped HTTPS proxy synchronization and container discovery failed | The authentication-related workload-network configuration was incomplete. |
| Outer inventory reported zero free GHz | The physical machine was under CPU pressure; this was not a CPU Ready measurement. |
| NSX showed Stable / Up, repository sync, roughly 96% CPU, four alarms | NSX remained running under high CPU load. |
| Supervisor Config Running, Host Config Configuring | Control-plane progress had preceded host configuration. |
| Apply Solution health check failed for `nested-esx03` | A host health check blocked that reconciliation attempt. |

<details>
<summary>NSX, Pinniped, and CPU-pressure evidence during reconciliation</summary>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s47-supervisor-encounters-nsx-http-503.png" alt="Supervisor encounters NSX HTTP 503. NSX trust-management request fails, the node connection is disconnected, and master VM configuration is pending." caption="Figure S47. Supervisor encounters NSX HTTP 503. NSX trust-management request fails, the node connection is disconnected, and master VM configuration is pending." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s48-pinniped-reconciliation-error.png" alt="Pinniped reconciliation error. Workload network step reports failed HTTPS proxy sync and inability to get pinniped-concierge containers." caption="Figure S48. Pinniped reconciliation error. Workload network step reports failed HTTPS proxy sync and inability to get pinniped-concierge containers." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s49-physical-host-cpu-pressure.png" alt="Physical host CPU pressure. Outer vCenter reports zero free GHz while the lab is slow; memory-tiered capacity remains available." caption="Figure S49. Physical host CPU pressure. Outer vCenter reports zero free GHz while the lab is slow; memory-tiered capacity remains available." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s50-nsx-appliance-under-high-cpu-load.png" alt="NSX appliance under high CPU load. NSX cluster Stable and appliance Up, with repository synchronization and approximately 96 percent CPU usage." caption="Figure S50. NSX appliance under high CPU load. NSX cluster Stable and appliance Up, with repository synchronization and approximately 96 percent CPU usage." width="1000px" height="auto" variant="technical" >}}

</details>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s51-supervisor-running-before-host-configuration.png" alt="Supervisor running before host configuration. Config Status is Running while Host Config remains Configuring; API address is 10.1.35.7." caption="Figure S51. Supervisor running before host configuration. Config Status is Running while Host Config remains Configuring; API address is 10.1.35.7." width="1000px" height="auto" variant="technical" >}}

<details>
<summary>Delayed host conditions and Apply Solution health checks</summary>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s52-host-configuration-unchanged-for-38-minutes.png" alt="Host configuration unchanged for 38 minutes. Host-node conditions remain incomplete after the control-plane status has advanced." caption="Figure S52. Host configuration unchanged for 38 minutes. Host-node conditions remain incomplete after the control-plane status has advanced." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s53-apply-solution-health-check-failures.png" alt="Apply Solution health check failures. Recent tasks show repeated health-check failures for nested-esx03 and subsequent reconciliation activity." caption="Figure S53. Apply Solution health check failures. Recent tasks show repeated health-check failures for nested-esx03 and subsequent reconciliation activity." width="1000px" height="auto" variant="technical" >}}

</details>

For a similar delay, inspect **Supervisor Management → status details**, the cluster’s recent tasks, and **cluster → Monitor → vSAN → Skyline Health**. Resolve failures; silence only understood warnings related to nested hardware.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h096-vsan-health-findings.png" alt="Monitor > vSAN > vSAN Health displays a cluster-compliance finding and the Silence Alert control" caption="Figure H096. Example vSAN health finding with Troubleshoot and Silence Alert controls." width="1000px" height="auto" variant="technical" >}}

I did not isolate a single cause of the recovery.

Both **Config Status** and **Host Config Status** reached **Running**, while the Supervisor remained **Medium**:

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s54-supervisor-and-all-host-configuration-running.png" alt="Supervisor and all host configuration running. The view shows Running for both status columns, three hosts, and API 10.1.35.7." caption="Figure S54. Supervisor and all host configuration running. The view shows Running for both status columns, three hosts, and API 10.1.35.7." width="1000px" height="auto" variant="technical" >}}

The UI showed three hosts, three system namespaces, API address `10.1.35.7`, and Supervisor version `v1.34.9+vmware.1-vsc.9.1.1.0-25712839`. Both Running columns—not just the existence of a control-plane VM—were the checkpoint for continuing.

**Mac terminal — suggested DNS verification, not a captured completed test:**

```bash
nslookup vcf-mgmt-supervisor01.vcf.lab.devynharrington.com 192.168.88.1
```

The expected target for this lab is `10.1.35.7`. My later CLI used the API IP directly.

## 10. Configure the namespace and its Public SubnetSet

At **Supervisor → Configure → General → Kubernetes Service**, I associated **`VKR-Subscribed-Library`**.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s55-vkr-library-associated-with-supervisor.png" alt="Supervisor Kubernetes Service lists VKR-Subscribed-Library as Subscribed." caption="Figure S55. Release library associated with the Supervisor; the displayed storage usage is not a minimum requirement." width="1000px" height="auto" variant="technical" >}}

In **Supervisor Management / Namespaces → Create Namespace**, I selected `vcf-mgmt-supervisor01`, named the namespace **`homelab-vks-ns`**, and selected the zone containing the cluster. I left **Override default network settings** unchecked, then reviewed and created the namespace.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s56-create-homelab-vks-namespace.png" alt="Create Namespace with homelab-vks-ns entered and Override default network settings unchecked." caption="Figure S56. Create homelab-vks-ns using the default network settings." width="1000px" height="auto" variant="technical" >}}

Then I configured the namespace resources:

| Namespace item | Setting or check |
|---|---|
| Permissions | Grant the intended principal **Can Edit**. The final permission dialog is not captured. |
| VM class | **`best-effort-small`**: 2 vCPU, 4 GiB, no CPU/memory reservation shown. |
| Storage | **`vcf-mgmt-cl01 - Optimal Datastore Default Policy - AutoRAID`**. |
| VM Service / Content Libraries | Associate **`VKR-Subscribed-Library`** here as well as under the Supervisor's Kubernetes Service. |
| Resources | Confirm the Kubernetes and Network service pages load. |

If the VKS wizard cannot find the VM class, release, or storage, check these namespace associations before recreating the library or cluster.

### Create `public` before creating VKS

In **`homelab-vks-ns` → Resources → Network service → SubnetSets → New SubnetSet**, I used these settings:

| Field | Final setting |
|---|---|
| Name | `public` |
| Access Mode | **Public** |
| Auto-allocate IP CIDR | On |
| Size | **32 IPs** |
| DHCP | None |
| Labels | None shown |

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s61-final-public-subnetset-settings.png" alt="SubnetSet settings: public, Public access, auto-allocate On, 32 IPs (/27), and DHCP None." caption="Figure S61. Final settings for the public SubnetSet." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s62-public-subnetset-created-successfully.png" alt="The public SubnetSet shows Success; its allocated CIDR is not displayed." caption="Figure S62. The public SubnetSet reaches Success." width="1000px" height="auto" variant="technical" >}}

The **32 IPs** setting requests a `/27`; fewer addresses are available for guest nodes. The screenshot does not show the allocated CIDR.

**Public** is a VPC access mode, not public internet exposure; these remain private lab addresses. The default private network was rejected without **SNAT** (source network address translation), so I used `public`.

## 11. Create VKS with Custom Configuration and verify it from Supervisor

In **Resources → Kubernetes service → Create**, I selected **Custom Configuration** to choose `public` as the primary node network.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s63-start-the-vks-creation-wizard.png" alt="New Kubernetes Cluster wizard starts with Default Configuration selected and Custom Configuration available." caption="Figure S63. Start the New Kubernetes Cluster wizard, then select Custom Configuration." width="1000px" height="auto" variant="technical" >}}

### General settings and storage

| Field | Setting |
|---|---|
| Cluster name | **`kubernetes-cluster-dhby`** |
| Type / configuration | Cluster API / Custom Configuration |
| ClusterClass | `builtin-generic-v3.7.0` |
| Kubernetes release | `v1.36.2---vmware.2-vkr.3` |
| VM class | `best-effort-small` |
| Node VM storage class | `vcf-mgmt-cl01-optimal-datastore-default-policy-autoraid` |
| Default PVC storage class | `vcf-mgmt-cl01-optimal-datastore-default-policy-autoraid-latebinding` |
| Additional node volumes | None shown |
| Custom storage annotations / labels | Blank |

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s64-vks-custom-general-settings.png" alt="VKS custom general settings. Actual generated name kubernetes-cluster-dhby, builtin-generic-v3.7.0, release v1.36.2---vmware.2-vkr.3, and best-effort-small." caption="Figure S64. Custom Configuration with the selected release, ClusterClass, and VM class." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s65-persistent-volume-storage-selection.png" alt="Persistent volume storage selection. The -latebinding AutoRAID storage class is selected as the persistent-volume default; no extra node volumes are shown." caption="Figure S65. The -latebinding AutoRAID class is the default for persistent volumes." width="1000px" height="auto" variant="technical" >}}

**Cluster API** manages the cluster using a **ClusterClass** topology. A **PVC** (PersistentVolumeClaim) requests application storage; its default storage class is separate from the node VM storage class.

I kept the generated name `kubernetes-cluster-dhby` in all commands. `homelab-vks01` refers to the earlier failed deployment.

### Primary network and replicas

| Field | Final value |
|---|---|
| CNI / pod CIDR | Antrea / `10.95.0.0/16` |
| Primary interface | `eth0` |
| Network selection | Use custom primary network |
| Network | `public` (Subnet Set) |
| Primary-interface MTU | **1500** |
| Additional static routes / interfaces | None |
| Control plane | One replica; Photon 5; Overrides off |
| Worker pool | One replica; Photon 5; advanced settings unchecked |
| Generated pool name | `kubernetes-cluster-dhby-np-vsw3` |

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s66-antrea-and-pod-network.png" alt="Antrea and pod network. Antrea selected and pod CIDR 10.95.0.0/16; primary interface is eth0." caption="Figure S66. Antrea and pod network. Antrea selected and pod CIDR 10.95.0.0/16; primary interface is eth0." width="1000px" height="auto" variant="technical" >}}

<details>
<summary>Intermediate primary-network form before the MTU correction</summary>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s67-select-public-before-correcting-mtu.png" alt="Select public before correcting MTU. Custom primary public SubnetSet is selected; MTU is still 9000 at this intermediate stage." caption="Figure S67. Select public before correcting MTU. Custom primary public SubnetSet is selected; MTU is still 9000 at this intermediate stage." width="1000px" height="auto" variant="technical" >}}

</details>

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s68-final-vks-primary-network-mtu.png" alt="Final VKS primary network MTU. Custom primary eth0 uses public and MTU 1500, with no extra static routes." caption="Figure S68. Final VKS primary network MTU. Custom primary eth0 uses public and MTU 1500, with no extra static routes." width="1000px" height="auto" variant="technical" >}}

If you do not change the network to `public` and leave the default private network selected, you will get this error at **step 5, Review and Confirm**, in this VPC namespace without SNAT:

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/h199-vks-private-network-admission-error.png" alt="admission rejects a guest cluster on the default private network in a VPC namespace without SNAT" caption="Figure H199. Step 5 rejects the default private network in this VPC namespace without SNAT." width="1000px" height="auto" variant="technical" >}}

I set the guest primary-interface MTU to **1500** because jumbo frames were unverified across the external VLAN path. The separate VDS, vMotion, and vSAN settings remained **9000**.

The default YAML showed Service CIDR `10.96.0.0/12` and domain `cluster.local`; I did not verify these against the full runtime configuration.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s69-single-vks-control-plane.png" alt="Single VKS control plane. One replica, Photon 5, and Overrides off." caption="Figure S69. Single VKS control plane. One replica, Photon 5, and Overrides off." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s70-single-vks-worker-pool.png" alt="Single VKS worker pool. Generated node pool kubernetes-cluster-dhby-np-vsw3 has one replica and Photon 5; advanced settings unchecked." caption="Figure S70. Single VKS worker pool. Generated node pool kubernetes-cluster-dhby-np-vsw3 has one replica and Photon 5; advanced settings unchecked." width="1000px" height="auto" variant="technical" >}}

With `public` selected, I reviewed and created the cluster, then confirmed its status was **Available**:

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s71-vks-cluster-available-in-the-ui.png" alt="VKS cluster status is Available; the control plane uses best-effort-small and the AutoRAID node VM storage class." caption="Figure S71. VKS cluster Available, with best-effort-small and the AutoRAID node VM storage class." width="1000px" height="auto" variant="technical" >}}

### Authenticate to Supervisor and select its namespace

The [VMware Supervisor CLI reference](https://github.com/vmware/vsphere-supervisor/blob/main/airgapped/air-gapped-vcf91.md) distinguishes three context scopes:

| Context | Resources |
|---|---|
| Supervisor | Supervisor infrastructure and namespace resources |
| Supervisor namespace `supervisor-redeploy:homelab-vks-ns` | Guest **Cluster API object**, node VMs, and namespace network resources |
| Guest cluster | Kubernetes nodes, system pods, and application namespaces |

**Mac terminal — create the Supervisor context:**

```bash
vcf context create supervisor-redeploy \
  --endpoint https://10.1.35.7 \
  --username administrator@vsphere.local \
  --auth-type basic \
  --type k8s \
  --insecure-skip-tls-verify
```

Enter the SSO password at the prompt. This lab command skips TLS certificate verification; omit `--insecure-skip-tls-verify` when your client trusts the endpoint certificate.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s73-supervisor-login-succeeds-despite-telemetry-warning.png" alt="Supervisor login succeeds despite telemetry warning. The telemetry:v9.0.2 manifest lookup fails, but login succeeds and Supervisor namespace contexts are saved." caption="Figure S73. Supervisor login succeeds and contexts are saved despite the telemetry warning." width="1000px" height="auto" variant="technical" >}}

Login succeeded and the contexts were saved despite a Darwin ARM64 `telemetry:v9.0.2` lookup returning `MANIFEST_UNKNOWN`.

**Mac terminal — Supervisor namespace context:**

```bash
vcf context use supervisor-redeploy:homelab-vks-ns
kubectl config current-context
kubectl get clusters -n homelab-vks-ns
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s74-namespace-context-and-cluster-query-succeed.png" alt="Namespace context and cluster query succeed. Context activates despite telemetry and Harbor discovery warnings; cluster is Provisioned, Available=True, with one control plane and one worker available and up to date." caption="Figure S74. Cluster Provisioned and Available, with one control-plane node and one worker ready." width="1000px" height="auto" variant="technical" >}}

| Cluster result | Observed output |
|---|---|
| Name / ClusterClass | `kubernetes-cluster-dhby` / `builtin-generic-v3.7.0` |
| Available / Phase | `True` / `Provisioned` |
| Control plane desired / available / up-to-date | `1 / 1 / 1` |
| Worker desired / available / up-to-date | `1 / 1 / 1` |
| Version | `v1.36.2+vmware.2` |

A Harbor plugin-source discovery warning also appeared, but the cluster query succeeded. The warning remained unresolved; I did not need to install Harbor for this query.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/s75-final-nested-vcenter-inventory.png" alt="Final nested vCenter inventory. The namespace contains kubernetes-cluster-dhby and both powered-on node VMs. SupervisorControlPlaneVM, NSX, Operations, SDDC Manager, vCenter, management services, Cloud Proxy, and vna01 are visible; host warning badges remain." caption="Figure S75. Nested vCenter inventory shows the VKS cluster and both powered-on node VMs; host warnings remain." width="1000px" height="auto" variant="technical" >}}

Both guest-node VMs were powered on, though the nested ESXi hosts still showed warnings.

If the cluster is still reconciling, use these optional diagnostics; not all were run during this deployment.

**Mac terminal — optional diagnostics in the Supervisor namespace context:**

```bash
kubectl get clusters -n homelab-vks-ns -w
kubectl get machines -n homelab-vks-ns -o wide
kubectl get virtualmachines -n homelab-vks-ns -o wide
kubectl get events -n homelab-vks-ns --sort-by=.lastTimestamp
kubectl describe subnetset public -n homelab-vks-ns
kubectl get subnets -n homelab-vks-ns -o wide
kubectl get cluster kubernetes-cluster-dhby -n homelab-vks-ns -o yaml
```

Stop the watch with **Ctrl+C**, then run the remaining commands. Cluster creation continues.


## 12. Enter the guest cluster with its downloaded kubeconfig

With VKS **Available**, I connected to the guest Kubernetes API to verify its nodes and run a workload. The Supervisor context manages the VKS cluster object; the guest context accesses its nodes, pods, and Services. The vSphere namespace `homelab-vks-ns` and guest namespace `lab-validation` belong to different clusters.

From `supervisor-redeploy:homelab-vks-ns`, I tried switching to the expected guest context:

**Mac terminal — switch to the guest context:**

```bash
vcf context use supervisor-redeploy:homelab-vks-ns:kubernetes-cluster-dhby
kubectl config current-context
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a01-guest-context-missing.png" alt="Mac terminal reports missing telemetry v9.0.2 manifest and missing VCF guest context; current kubectl context remains the Supervisor namespace" caption="Figure A01. Guest context not found; the Supervisor namespace context remains active." width="1000px" height="auto" variant="technical" >}}

The guest context was not found. A `telemetry:v9.0.2` lookup also returned `MANIFEST_UNKNOWN`, but that does not establish why the context was missing. I checked the available contexts:

**Mac terminal — inspect VCF contexts:**

```bash
vcf context list
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a02-vcf-context-list.png" alt="VCF context list includes supervisor-redeploy and homelab-vks-ns but no kubernetes-cluster-dhby guest context" caption="Figure A02. No context exists for the new guest cluster." width="1000px" height="auto" variant="technical" >}}

Instead, I downloaded the kubeconfig from **nested vCenter → homelab-vks-ns → Resources → Kubernetes Service → kubernetes-cluster-dhby → Download Kubeconfig File**. Keep this credential file private and use your own cluster name and file path.

**Mac terminal — locate the downloaded file:**

```bash
ls -lt ~/Downloads/*kube*
```

I first used `--kubeconfig` to query the guest cluster explicitly:

**Mac terminal — guest-cluster access with explicit kubeconfig:**

```bash
kubectl --kubeconfig="$HOME/Downloads/kubernetes-cluster-dhby-kubeconfig.yaml" config get-contexts
kubectl --kubeconfig="$HOME/Downloads/kubernetes-cluster-dhby-kubeconfig.yaml" get nodes -o wide
kubectl --kubeconfig="$HOME/Downloads/kubernetes-cluster-dhby-kubeconfig.yaml" get pods -A -o wide
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a04-guest-kubeconfig-context.png" alt="kubectl context inspection selects kubernetes-cluster-dhby-admin at kubernetes-cluster-dhby in the downloaded file" caption="Figure A04. The downloaded kubeconfig selects the guest admin context." width="1000px" height="auto" variant="technical" >}}

The context was `kubernetes-cluster-dhby-admin@kubernetes-cluster-dhby`. After the queries succeeded, I selected this kubeconfig for the session:

**Mac terminal — select the guest cluster for subsequent commands:**

```bash
export KUBECONFIG="$HOME/Downloads/kubernetes-cluster-dhby-kubeconfig.yaml"
```

All `kubectl` commands below use this export; repeat it in a new terminal. It leaves the default kubeconfig unchanged and bypasses the missing VCF guest context.

## 13. Check nodes, system pods, storage classes, and resource use

I checked guest-cluster readiness before deploying the test workload.

**Mac terminal — guest-cluster context:**

```bash
kubectl get nodes -o wide
kubectl get pods -A -o wide
kubectl get storageclass
kubectl top nodes
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a05-ready-nodes-storage-metrics.png" alt="Both VKS nodes are Ready at 10.1.35.66 and 10.1.35.67, latebinding AutoRAID is the default storage class, and node CPU and memory metrics are available" caption="Figure A05. Both nodes are Ready, the default storage class is available, and metrics queries succeed." width="1000px" height="auto" variant="technical" >}}

| Observation | Control plane | Worker |
| --- | --- | --- |
| Status | Ready | Ready |
| Internal IP | `10.1.35.66` | `10.1.35.67` |
| Kubernetes | `v1.36.2+vmware.2` | `v1.36.2+vmware.2` |
| CPU at capture | 499m / 25% | 76m / 3% |
| Memory at capture | 2020Mi / 71% | 510Mi / 18% |

Both nodes ran Photon OS on `amd64`. The worker's role column showed `<none>`; its node-pool configuration identified it as the worker. Generated node names change when the cluster is recreated.

The system-pod query showed **20 pods Running, with all listed containers ready**, summarized below. Figure A05 shows the other checks.

| System component | Pods and ready containers | Placement | Observed restarts |
| --- | --- | --- | --- |
| Antrea agents | 2 pods, each 2/2 | One per node | 0 / 0 |
| Antrea controller | 1/1 | Control plane | 0 |
| CoreDNS | 2 pods, each 1/1 | Control plane | 0 / 0 |
| etcd | 1/1 | Control plane | 0 |
| Kubernetes API server | 1/1 | Control plane | 0 |
| Kubernetes controller manager | 1/1 | Control plane | 1 |
| kube-proxy | 2 pods, each 1/1 | One per node | 0 / 0 |
| Kubernetes scheduler | 1/1 | Control plane | 1 |
| metrics-server | 1/1 | Control plane | 0 |
| snapshot-controller | 1/1 | Control plane | 0 |
| secretgen-controller | 1/1 | Control plane | 0 |
| kapp-controller | 2/2 | Control plane | 0 |
| guest-cluster-auth-svc | 1/1 | Control plane | 0 |
| guest-cluster-cloud-provider | 1/1 | Control plane | 1 |
| vSphere CSI controller | 7/7 | Control plane | 0 |
| vSphere CSI nodes | 2 pods, each 3/3 | One per node | 4 control plane / 1 worker |

Some pods had earlier restarts, but none showed an active crash loop. Antrea provides networking, CoreDNS handles DNS, metrics-server reports resource use, and vSphere CSI integrates storage. The workload below tests these functions beyond pod readiness.

I had two AutoRAID storage classes:

| Storage class | Binding | Default |
| --- | --- | --- |
| `vcf-mgmt-cl01-optimal-datastore-default-policy-autoraid` | `Immediate` | No |
| `vcf-mgmt-cl01-optimal-datastore-default-policy-autoraid-latebinding` | `WaitForFirstConsumer` | Yes |

Both use `csi.vsphere.vmware.com`, support volume expansion, and reclaim volumes with `Delete`. `Immediate` binds or provisions storage when the PVC is created; `WaitForFirstConsumer` waits for a pod’s scheduling requirements. The manifest below uses the default class, so check yours before applying it. See the [storage-class documentation](https://kubernetes.io/docs/concepts/storage/storage-classes/).

**Checkpoint:** nodes and system containers are ready, storage is available, and metrics work. Resource figures are snapshots, not capacity benchmarks.

## 14. Create the BusyBox and PVC validation workload

I used a BusyBox pod and PVC in the guest namespace `lab-validation` to test image retrieval, networking, and storage.

Paste the entire block into the guest-cluster terminal, including the closing `EOF`. Scroll to view the manifest; **Copy** copies the entire block.

**Mac terminal — guest-cluster context:**

<div class="compact-manifest">

```bash
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Namespace
metadata:
  name: lab-validation
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-storage
  namespace: lab-validation
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: lab-test
  namespace: lab-validation
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: test
      image: busybox:1.37
      command: ["sh", "-c", "sleep 86400"]
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
      resources:
        requests:
          cpu: 10m
          memory: 16Mi
        limits:
          cpu: 100m
          memory: 64Mi
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: test-storage
EOF
```

</div>

The pod mounts a **1 GiB, ReadWriteOnce** volume at `/data`, using the default latebinding AutoRAID class. It runs as nonroot UID/GID 1000 with `fsGroup: 1000`, `RuntimeDefault` seccomp, no privilege escalation, and all Linux capabilities dropped. See the [security-context documentation](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/).

I waited for readiness, then checked the pod and PVC:

**Mac terminal — guest-cluster context:**

```bash
kubectl wait -n lab-validation --for=condition=Ready pod/lab-test --timeout=180s
kubectl get pods,pvc -n lab-validation -o wide
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a07-image-pull-failure-pvc-bound.png" alt="Readiness wait times out and lab-test is ImagePullBackOff, while test-storage is Bound with 1Gi capacity and ReadWriteOnce access" caption="Figure A07. Image retrieval failed, but the 1 GiB PVC was Bound." width="1000px" height="auto" variant="technical" >}}

The wait timed out with `lab-test` in **ImagePullBackOff**, while `test-storage` was **Bound**. I inspected the pod to isolate the image-pull failure:

**Mac terminal — inspect the failing pod:**

```bash
kubectl describe pod lab-test -n lab-validation
```

Events showed `SuccessfulAttachVolume`: scheduling and volume attachment had succeeded. The image had not been pulled, so I investigated DNS before testing writes to the volume.

## 15. Diagnose the image-pull timeout and permit lab DNS on MikroTik

In the **Events** section at the bottom of the `kubectl describe pod lab-test -n lab-validation` output from the previous step, I found this Docker Hub DNS timeout:

```text
Failed to pull image "busybox:1.37":
failed to pull and unpack image "docker.io/library/busybox:1.37":
failed to resolve image: failed to do request:
Head "https://registry-1.docker.io/v2/library/busybox/manifests/1.37":
dial tcp: lookup registry-1.docker.io on 127.0.0.53:53:
read udp 127.0.0.1:44928->127.0.0.53:53: i/o timeout
```

The node’s local resolver stub, `127.0.0.53`, timed out resolving Docker Hub before connecting to the registry. The error does not identify the upstream resolver or indicate an authentication or rate-limit failure.

I inspected the MikroTik configuration. Use your router’s address and login:

**Mac terminal — connect to MikroTik:**

```bash
ssh admin@192.168.88.1
```

**MikroTik RouterOS terminal — inspect DNS, firewall, interfaces, and NAT:**

```routeros
/ip/dns/print
/ip/firewall/filter/print detail
/interface/list/member/print
/ip/firewall/nat/print detail
```

DNS was already enabled with `allow-remote-requests=yes` and dynamic upstream servers `206.225.75.226` and `206.225.75.225`. WAN masquerade was also configured; its presence alone did not verify internet access.

The input rule `defconf: drop all not coming from LAN` matched `in-interface-list=!LAN`, and `vlan2006-external` was missing from the LAN list:

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a08-mikrotik-interface-list.png" alt="MikroTik interface-list output shows bridge and back-to-home-vpn in LAN and ether1 in WAN, with no vlan2006-external entry" caption="Figure A08. vlan2006-external is absent from the LAN interface list." width="1000px" height="auto" variant="technical" >}}

Queries to the router use its **input** chain; forwarding and NAT rules do not override it. I allowed DNS from `10.1.35.0/24` on `vlan2006-external` before the input drop.

Run each line once, after checking the interface, subnet, and drop-rule comment against your router. The `place-before` selector must match the intended drop rule. DNS needs both UDP and TCP port 53; see [MikroTik’s DNS documentation](https://help.mikrotik.com/docs/spaces/ROS/pages/37748767/DNS).

**MikroTik RouterOS terminal — allow lab DNS:**

```routeros
/ip/firewall/filter/add chain=input action=accept in-interface=vlan2006-external src-address=10.1.35.0/24 protocol=udp dst-port=53 place-before=[find where comment="defconf: drop all not coming from LAN"] comment="VKS lab DNS UDP"

/ip/firewall/filter/add chain=input action=accept in-interface=vlan2006-external src-address=10.1.35.0/24 protocol=tcp dst-port=53 place-before=[find where comment="defconf: drop all not coming from LAN"] comment="VKS lab DNS TCP"
```

With DNS allowed only from the lab interface and subnet, I watched the existing pod retry its image pull.

**Mac terminal — guest-cluster context:**

```bash
kubectl get pod lab-test -n lab-validation -w
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a09-busybox-running-after-dns-fix.png" alt="Watched lab-test pod changes from 0/1 ImagePullBackOff to 1/1 Running with zero restarts" caption="Figure A09. The existing pod recovered on its image-pull retry and became 1/1 Running." width="1000px" height="auto" variant="technical" >}}

The pod reached **`1/1 Running`** with zero restarts. Press **Ctrl+C** to stop the watch. If your pod remains in backoff, run `kubectl describe pod lab-test -n lab-validation` again and check the latest error.

Recovery after the firewall change supports the DNS diagnosis. The BusyBox pull and later NGINX rollout were functional checks; I did not capture firewall counters or a packet trace.

## 16. Prove cluster DNS and a write/read on the mounted volume

With BusyBox running, I tested cluster DNS:

**Mac terminal — run inside the guest test pod:**

```bash
kubectl exec -n lab-validation lab-test -- nslookup kubernetes.default.svc.cluster.local
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a10-guest-cluster-dns-success.png" alt="BusyBox nslookup queries DNS server 10.96.0.10 and resolves kubernetes.default.svc.cluster.local to 10.96.0.1" caption="Figure A10. Cluster DNS resolves the Kubernetes Service from the test pod." width="1000px" height="auto" variant="technical" >}}

DNS server `10.96.0.10` resolved `kubernetes.default.svc.cluster.local` to `10.96.0.1`. BusyBox ran on the worker and CoreDNS on the control plane, exercising DNS across nodes. This tested an internal name, not an external-domain lookup.

These guest addresses do not verify the full Service CIDR or resolve the earlier Supervisor CIDR discrepancy.

Next I wrote a file to `/data` and read it back.

**Mac terminal — run inside the guest test pod:**

```bash
kubectl exec -n lab-validation lab-test -- sh -c 'echo "VCF 9.1.1 VKS storage test passed" > /data/test.txt && cat /data/test.txt'
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a11-persistent-volume-write-read.png" alt="kubectl exec writes to /data/test.txt and reads back VCF 9.1.1 VKS storage test passed" caption="Figure A11. The pod writes to the mounted PVC and reads the file back." width="1000px" height="auto" variant="technical" >}}

The bound PVC, successful attachment, and write/read confirmed provisioning and basic storage I/O. Persistence across pod replacement, failure recovery, and performance were not tested.

## 17. Deploy NGINX and open it through a LoadBalancer

I deployed one NGINX replica in `lab-validation` with a `LoadBalancer` Service for access from my Mac. It does not use the BusyBox PVC.

The [unprivileged NGINX image](https://github.com/nginx/docker-nginx-unprivileged) listens on **8080** and supports the nonroot settings below. I used the moving tag `stable-alpine`; its digest was not captured.

Paste the entire block, including `EOF`, into the guest-cluster terminal. The `lab-validation` namespace must already exist. Scroll to view the full manifest; **Copy** copies the entire block.

**Mac terminal — guest-cluster context:**

<div class="compact-manifest">

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: lab-web
  namespace: lab-validation
spec:
  replicas: 1
  selector:
    matchLabels:
      app: lab-web
  template:
    metadata:
      labels:
        app: lab-web
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: nginx
          image: nginxinc/nginx-unprivileged:stable-alpine
          ports:
            - containerPort: 8080
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              cpu: 25m
              memory: 32Mi
            limits:
              cpu: 250m
              memory: 128Mi
          readinessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: lab-web
  namespace: lab-validation
spec:
  type: LoadBalancer
  selector:
    app: lab-web
  ports:
    - name: http
      port: 80
      targetPort: 8080
EOF
```

</div>

The Service selects `app: lab-web` and forwards **80/TCP → 8080**. The pod runs as nonroot UID 101 with restricted privileges and an HTTP readiness probe.

I checked the rollout:

**Mac terminal — guest-cluster context:**

```bash
kubectl rollout status deployment/lab-web -n lab-validation --timeout=180s
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a13-nginx-rollout-success.png" alt="kubectl rollout status returns deployment lab-web successfully rolled out" caption="Figure A13. NGINX successfully rolled out." width="1000px" height="auto" variant="technical" >}}

After the rollout succeeded, I checked the Service address:

**Mac terminal — guest-cluster context:**

```bash
kubectl get service lab-web -n lab-validation -w
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a14-nginx-loadbalancer-address.png" alt="lab-web LoadBalancer Service has ClusterIP 10.99.227.208, external IP 10.1.35.34, and port display 80:30703/TCP" caption="Figure A14. LoadBalancer address 10.1.35.34, Service port 80, and NodePort 30703." width="1000px" height="auto" variant="technical" >}}

| Service field | Recorded result |
| --- | --- |
| Name / namespace | `lab-web` / `lab-validation` |
| Type | `LoadBalancer` |
| ClusterIP | `10.99.227.208` |
| External IP | `10.1.35.34` |
| Service output | `80:30703/TCP` |
| Browser-facing Service port | `80` |
| Container target port | `8080` |
| Allocated NodePort | `30703` |

Press **Ctrl+C** once the address appears, then open your Service’s assigned IP. Check it again if you recreate the Service.

**Mac browser — open the assigned address:**

```text
http://10.1.35.34
```

The application path was **Mac browser → `10.1.35.34:80` → `lab-web` Service → NGINX pod on `8080`**. Browser access uses Service port **80**, not NodePort 30703.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-tepless-vks/a15-nginx-browser-success.png" alt="Browser page displays Welcome to nginx and confirms the web server is installed and working" caption="Figure A15. The NGINX welcome page in my Mac browser." width="1000px" height="auto" variant="technical" >}}

NGINX was reachable from my home network through the VKS LoadBalancer. This tested private lab HTTP access; public hosting and HTTPS were outside the scope.

## 18. Results, practical lessons, and the next application

The rebuild reached these milestones:

| Milestone | Confirmed result |
| --- | --- |
| VCF 9.1.1 | Installer deployment completed with Day-0 Automation disabled |
| VNA | Large `vna01` reached Up / Success after the Ryzen CPU-guard edit and recovery |
| Supervisor | Medium Supervisor and all host configurations Running |
| Namespace and network | `homelab-vks-ns` with Public SubnetSet `public`, 32 IPs, and `/24` external networking |
| VKS | Cluster Provisioned and Available; downloaded kubeconfig provided access |
| Guest readiness | Both nodes Ready; 20 system pods Running with containers ready |
| DNS and image retrieval | Internal DNS worked; BusyBox and NGINX images pulled after the router DNS fix |
| Storage | 1 GiB PVC bound and attached; `/data/test.txt` write/read passed |
| Application | NGINX served through `10.1.35.34:80` |

This was a single-physical-host nested lab with one Supervisor control-plane VM and one VKS control plane and worker. It demonstrated basic functionality, not production availability, performance, or recovery.

### Continue from the running cluster

I left the BusyBox pod, PVC, and NGINX resources in `lab-validation`. To inspect them in a later session:

**Mac terminal — select and inspect the guest cluster in a later session:**

```bash
export KUBECONFIG="$HOME/Downloads/kubernetes-cluster-dhby-kubeconfig.yaml"
kubectl config current-context
kubectl get nodes -o wide
kubectl get pods -n lab-validation -o wide
kubectl get pvc -n lab-validation
kubectl get service lab-web -n lab-validation
```

BusyBox sleeps for 24 hours; check its state before using `exec` again. Read the Service’s current IP before reopening NGINX.

### Future work: a custom application

Next, I plan to containerize a custom application, push it to a reachable registry, and deploy it with readiness checks and a Service. Although my Mac uses ARM64, the VKS nodes require an **AMD64** image or a multi-architecture image that includes AMD64.

Then I can add DNS, TLS, credential management, and persistent dependencies. The frontend can run in VKS while its database stays elsewhere.

## 19. References

Sources for the deployment workflow and supporting concepts:

| Reference | Where it helps |
|---|---|
| [William Lam: VCF 9.1.1 TEP-less VLAN-backed VPCs](https://williamlam.com/2026/09/vcf-9-1-1-simplified-vsphere-kubernetes-service-vks-using-vlan-backed-vpcs-without-nsx-tunnel-endpoints-teps.html) | TEP-less networking, Supervisor, and VKS |
| [William Lam: nested VCF/VVF 9.1 deployment](https://williamlam.com/2026/05/vcf-9-1-automated-vmware-cloud-foundation-vcf-vmware-vsphere-foundation-vvf-nested-lab-deployment.html) and [upstream scripts](https://github.com/lamw/vcf-fleet-automated-lab-deployment) | Nested deployment automation |
| [My earlier VCF 9.1 article](/homelab/deploying-a-complete-vcf-9-1-management-domain-nested-esxi-nsx-recovery-and-automation/) | Physical-host foundation and earlier six-host build |
| [Broadcom PowerCLI installation](https://developer.broadcom.com/powercli/installation-guide) | PowerCLI setup |
| [Broadcom KB 443647: depot Activation Code](https://knowledge.broadcom.com/external/article/443647/download-token-has-been-replaced-by-acti.html) | Depot authentication |
| [Broadcom KB 444294: Cloud Proxy DNS](https://knowledge.broadcom.com/external/article/444294/cloud-proxy-91-deployment-fails-with-err.html) | Cloud Proxy DNS |
| [Broadcom KB 440372: nested VLAN port groups](https://knowledge.broadcom.com/external/article/440372/virtual-switch-portgroup-configuration-f.html) | Nested VLAN trunking |
| [Antrea traffic modes](https://antrea.io/docs/main/docs/noencap-hybrid-modes/) | Guest pod traffic modes |
| [William Lam: AMD Ryzen CPU guard](https://williamlam.com/2020/05/configure-nsx-t-edge-to-run-on-amd-ryzen-cpu.html) and [upgrade/file-layout caveat](https://williamlam.com/2025/10/quick-tip-workaround-for-nsx-edge-upgrade-to-vcf-9-0-1-running-amd-ryzen-cpus.html) | Ryzen workaround and upgrade limits |
| [Broadcom KB 416526: root recovery through GRUB](https://knowledge.broadcom.com/external/article/416526/nsxt-manager-root-password-needs-to-be.html) and [KB 316043: Edge/Manager recovery](https://knowledge.broadcom.com/external/article/316043/nsx-edge-nodes-or-managers-disconnected.html) | Root and GRUB recovery |
| [Broadcom KB 433761: library associations](https://knowledge.broadcom.com/external/article/433761/vcf-operations-unable-to-update-the-sup.html) and [KB 442430: Supervisor library in 9.1](https://knowledge.broadcom.com/external/article/442430/vcf-91-supervisor-content-library-fails.html) | Supervisor and guest-release libraries |
| [VMware Supervisor repository: VCF 9.1 access](https://github.com/vmware/vsphere-supervisor/blob/main/airgapped/air-gapped-vcf91.md) | CLI contexts |
| [MikroTik DNS](https://help.mikrotik.com/docs/spaces/ROS/pages/37748767/DNS) and [firewall filter chains](https://help.mikrotik.com/docs/spaces/ROS/pages/48660608/Filter) | Router DNS and input rules |
| [Kubernetes StorageClasses](https://kubernetes.io/docs/concepts/storage/storage-classes/) | Default classes and volume binding |
| [Kubernetes security contexts](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/) | Container security settings |
| [NGINX unprivileged image](https://github.com/nginx/docker-nginx-unprivileged) and [Kubernetes Services](https://kubernetes.io/docs/concepts/services-networking/service/) | NGINX ports and LoadBalancer access |
