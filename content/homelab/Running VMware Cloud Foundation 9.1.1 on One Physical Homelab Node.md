+++
title = "Running VMware Cloud Foundation 9.1.1 on One Physical Homelab Node"
date = "2026-09-13"
draft = false
slug = "vcf-9-1-1-single-node-homelab"
description = "How I moved from a looping VCF 9.1.1 upgrade and two failed Day-0 Automation attempts to a clean, working management domain on one physical Minisforum MS-A2."
images = ["/images/vcf/vcf-9-1-1-single-node-homelab/01-successful-five-stage-deployment.png"]
featureimage = "images/vcf/vcf-9-1-1-single-node-homelab/01-successful-five-stage-deployment.png"
hideFeatureImage = true
keywords = ["VMware Cloud Foundation 9.1.1", "VCF 9.1.1 homelab", "single-node VCF", "nested ESXi", "vSAN ESA HCL", "VCF Automation", "VCF Fleet Lifecycle"]
tags = ["VCF", "VMware Cloud Foundation", "VCF 9.1.1", "Home Lab", "Nested Virtualization", "Nested ESX", "vSAN ESA", "VCF Automation", "Fleet Lifecycle", "MINISFORUM MS-A2"]
categories = ["Home Lab"]

showDate = true
showReadingTime = true
showWordCount = false
showTableOfContents = true
+++

I set out to upgrade my single-node nested VMware Cloud Foundation lab from VCF 9.1 to 9.1.1. Fleet Lifecycle completed successfully, but the separate Services Runtime upgrade looped overnight and repeatedly cloned replacement VMs. Rather than continue repairing the existing environment, I cleaned up its licensing and rebuilt it.

The final deployment runs a healthy three-host VCF 9.1.1 management domain on the same physical Minisforum MS-A2. It includes vSphere, NSX, VCF Operations, and the new three-VM Management Services footprint. I left VCF Automation out after two failed deployment attempts so I could establish a stable core platform first.

Broadcom's [VCF 9.1.1 release notes](https://techdocs.broadcom.com/us/en/vmware-cis/vcf/vcf-9-0-and-later/9-1/release-notes/vmware-cloud-foundation-9-1-1-0-release-notes.html) cover the full component and known-issue details. Other [release highlights](https://blogs.vmware.com/cloud-foundation/2026/09/03/announcing-general-availability-of-vmware-cloud-foundation-9-1-1/) include the AI Assistant, GitOps technical preview, EVPN enhancements, and VKS 3.7 Add-on Management Framework. This article focuses on the deployment and Management Services changes relevant to my lab.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/01-successful-five-stage-deployment.png" alt="VCF Installer showing all five included VCF 9.1.1 deployment stages completed successfully" caption="The final VCF 9.1.1 deployment completed all five core stages with zero failures." width="1000px" height="auto" variant="technical" >}}

{{< alert icon="triangle-exclamation" >}}
**LAB-ONLY:** This nested, single-host design is not supported for production. Replacing the Installer HCL was part of my lab workaround; production deployments require hardware listed in the Broadcom Compatibility Guide.
{{< /alert >}}

## The Starting Point

One physical Minisforum MS-A2 ran the outer ESXi environment and vCenter. Inside it, three nested ESXi hosts formed the VCF management domain. Each nested host had 24 vCPUs, 128 GB of RAM, a 64 GB boot disk, a 32 GB vSAN ESA cache VMDK, and a 3000 GB capacity VMDK.

Every nested host and VCF appliance shared the resources of that one physical system. The outer ESXi host and vCenter therefore remained my recovery layer whenever the nested environment became unresponsive.

## Why the Upgrade Became a Rebuild

I began by updating Fleet Lifecycle from VCF 9.1 to 9.1.1. The workflow completed successfully at 7:55 PM.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/16-fleet-lifecycle-upgrade-completed.png" alt="VCF Management showing the Fleet Lifecycle Upgrade workflow completed successfully at 7:55 PM" caption="Fleet Lifecycle completed successfully. The failure came later in the separate VCF Services Runtime upgrade." width="1000px" height="auto" variant="technical" >}}

At 9:18 PM, I started the separate VCF Services Runtime upgrade. The workflow remained in progress overnight without completing.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/17-services-runtime-upgrade-started.png" alt="VCF Management showing the separate VCF Services Runtime Upgrade workflow in progress after starting at 9:18 PM" caption="The separate VCF Services Runtime upgrade began at 9:18 PM. Unlike Fleet Lifecycle, this workflow never completed." width="1000px" height="auto" variant="technical" >}}

By the following morning, vCenter showed three clone attempts from the same VCF Services Runtime 9.1.1 template. Each visible attempt was stalled at 41 percent while copying virtual-machine files.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/18-services-runtime-template-repeated-clones.png" alt="vCenter Recent Tasks showing three clone operations from the same VCF Services Runtime 9.1.1 template, each stalled at 41 percent" caption="Repeated Services Runtime clone attempts remained stalled at 41 percent." width="1000px" height="auto" variant="technical" >}}

Several `vcf-msr01-*` replacement VMs accumulated during the retries. The physical host was under heavy CPU pressure, and management interfaces and APIs were intermittently slow.

[Broadcom KB 443784](https://knowledge.broadcom.com/external/article/443784/911-vcf-management-services-node-resourc.html) notes that Management Services capacity pressure can disrupt Services Runtime upgrades. I did not capture that alert, so it is supporting context rather than a confirmed root cause. The evidence I had was the repeated clone attempts and an upgrade that never completed.

Rather than continue troubleshooting the old deployment, I chose a clean VCF 9.1.1 rebuild.

## Cleaning Up Registration and Licensing First

Before deleting the old environment, I deactivated its VCF Operations registration in the Business Services Console using [Broadcom KB 411467](https://knowledge.broadcom.com/external/article/411467/how-to-deactivate-a-license-currently-as.html). This reduces the risk of the stale registration issue documented in [KB 437616](https://knowledge.broadcom.com/external/article/437616/error-pending-activation-vcf-operations.html), which can leave a replacement instance stuck in Pending Activation.

I then removed the license allocations and deleted the License Server associated with the nested environment. Once the cloud-side registration and licensing were clean, I deleted the old VMs.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/18-license-entitlements-removed.png" alt="VCF Operations licensing screen showing VCF and vSAN allocations removed with zero capacity allocated" caption="The old VCF and vSAN allocations were removed before I deleted the nested environment." width="900px" height="auto" variant="technical" >}}

## Deleting Only the Nested Environment

I preserved the outer ESXi host, vCenter, datastore, DNS, and deployment scripts. I deleted the Installer VM and three nested ESXi hosts. Because the VCF appliances lived on those nested hosts, this removed the inner environment while preserving my recovery layer.

I used **Delete from Disk**, not **Remove from Inventory**. Removing only the inventory objects would have left the large nested VMDKs consuming datastore capacity.

During cleanup, the outer vCenter UI became unresponsive, although the VCSA remained accessible over SSH. I powered off the nested VMs from the outer ESXi Host Client, restarted the VCSA services, and then returned to vCenter to delete them. If a VM had already been deleted from the host, I removed its orphaned inventory entry.

```bash
service-control --stop --all
service-control --start --all
service-control --status --all
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/10-physical-vcenter-recovery-inventory.png" alt="Physical vCenter inventory after removing the disposable nested VCF environment" caption="The physical host and vCenter remained the recovery anchor while the Installer and nested hosts were rebuilt." width="950px" height="auto" variant="technical" >}}

## Adapting the Deployment Script for VCF 9.1.1

I used William Lam's [VCF 9.1 automated nested lab deployment](https://williamlam.com/2026/05/vcf-9-1-automated-vmware-cloud-foundation-vcf-vmware-vsphere-foundation-vvf-nested-lab-deployment.html) and [Fleet deployment script](https://github.com/lamw/vcf-automated-lab-deployment) as my starting point. His project deploys the nested ESXi appliances and VCF Installer, synchronizes the depot, generates the management-domain JSON, and can start bring-up. I adapted my local copy for VCF 9.1.1 and this lab's configuration.

I updated the Installer appliance and product version to `9.1.1.0`, retained my DNS, IP, VLAN, port-group, and naming plan, and set each nested host to 24 vCPUs and 128 GB of RAM. I also kept separate values for the boot, vSAN ESA cache, and capacity disks. Later, I added an option to omit VCF Automation, which I cover below.

With those changes saved, I used the script to redeploy the VCF Installer and nested ESXi hosts, downloaded the required 9.1.1 binaries, and generated a fresh deployment specification.

## The vSAN HCL Check Became Blocking in 9.1.1

VCF 9.1 allowed me to acknowledge the nested-hardware warning. In my 9.1.1 deployment, validation stopped because **ESX Host vSAN HCL Compatibility** failed on all three hosts. The virtual NVMe disks passed **vSAN ESA Disks Eligibility**, but the devices were not listed in the production vSAN ESA HCL.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/03-vsan-hcl-validation-failure.png" alt="VCF Installer validation showing vSAN ESA eligibility passed but ESX Host vSAN HCL Compatibility failed for all three nested hosts" caption="The disks were ESA-eligible, but the production HCL did not recognize VMware virtual NVMe hardware." width="900px" height="auto" variant="technical" >}}

## The HCL Detour

I adapted William Lam's [VCF 9.1 lab workaround](https://williamlam.com/2026/05/vcf-9-1-comprehensive-vcf-installer-sddc-manager-configuration-workarounds-for-lab-deployments.html). I generated a custom ESXi 9.1 HCL, copied it to the Installer, backed up `all.json`, and replaced the active file. Validation then passed.

VCF 9.1.1 provides a simpler lab option that I should have added to the `esaConfig` section of my deployment JSON:

```json
"esaConfig": {
  "enabled": true,
  "skipHclAutoDiskClaim": true
}
```

The `skipHclAutoDiskClaim` property is covered in the [VCF 9.1.1 enhancements article](https://williamlam.com/2026/09/10-exciting-enhancements-in-vmware-cloud-foundation-vcf-9-1-1.html#support-for-non-vsan-esa-hcl-disks-in-vcf-installer-ui). For a new nested 9.1.1 deployment, I would use this property instead of replacing the HCL. Production environments still require HCL-listed devices.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/05-hardware-validation-passed.png" alt="VCF Installer showing all hardware checks passed and only acknowledged CPU and storage capacity warnings remaining" caption="All three nested hosts passed hardware validation after the custom HCL became active." width="900px" height="auto" variant="technical" >}}

## The First Clean Deployment Stalled at Automation

The first clean deployment completed vSphere, NSX, VCF Management Platform, VCF Operations, and VCF Management Services. The VCF Automation stage then started its Fleet Lifecycle task, creating a temporary bootstrap VM and a new Consumption Services Runtime VM.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/09-fleet-bootstrap-vm.png" alt="Nested vCenter inventory showing the Automation bootstrap VM and newly cloned VCF Services Runtime VM" caption="The Automation bootstrap and new runtime appeared, but the stage did not complete." width="950px" height="auto" variant="technical" >}}

The task remained `RUNNING` for hours. Domain Manager logs showed repeated `getSystemInfo` timeouts and intermittent failures obtaining an SDDC Manager access token.

Fleet later returned a pre-validation error stating that the intended runtime FQDN and IP addresses `192.168.88.224` through `.226` were already in use. Those resources belonged to the runtime created during the same attempt, so the bootstrap was colliding with its own deployment.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/07-automation-self-collision.png" alt="VCF Installer Automation task showing the runtime FQDN and IP addresses 192.168.88.224 through 226 reported in use" caption="Pre-validation reported the newly created runtime and its IP pool as already in use." width="1000px" height="auto" variant="technical" >}}

The core platform remained deployed, but the `CONSUMPTION` runtime bootstrap did not finish.

## A Controlled Retry Produced the Same Failure

I made one controlled retry using [Broadcom KB 442401](https://knowledge.broadcom.com/external/article/442401). I removed only the incomplete Consumption runtime record, preserved the healthy Management runtime, and powered off the orphaned `vcf-asr01` VM.

Before retrying, I confirmed that the complete Automation IP range, `192.168.88.223` through `.228`, was free.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/08-automation-addresses-free.png" alt="Installer shell ping loop showing addresses 192.168.88.223 through 228 were free before retry" caption="The complete Automation range was free before the controlled retry." width="850px" height="auto" variant="technical" >}}

While connected to the VCF Installer over SSH, I followed the Domain Manager log and filtered it to the Automation and Consumption runtime events:

```bash
tail -F /var/log/vmware/vcf/domainmanager/domainmanager.log |
  grep --line-buffered -Ei \
  'VCF Automation|Fleet LCM Task ID|CONSUMPTION|Status:|bootstrap|failed|error'
```

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/06-fleet-api-timeouts.png" alt="Domain Manager log tail showing three failed getSystemInfo calls to SDDC Manager while the Fleet retry task remains running" caption="During the retry, Domain Manager exhausted three calls to SDDC Manager while the Fleet task remained running." width="950px" height="auto" variant="technical" >}}

Fleet created another runtime, but the same FQDN and IP collision returned. The stale database record was not the entire problem. With API calls failing under heavy resource pressure, I stopped retrying and rebuilt without Automation.

## Making Automation Optional

After two failed attempts, I made VCF Automation optional in the deployment script and disabled it for the final build:

```powershell
. "$PSScriptRoot/devyn-vcf-9.1.1-full-automation-1tb.ps1"

$DeployVCFAutomation = $false
$VAppLabel = "Devyn-VCF911-No-Automation"
$DeploymentInstanceName = "Devyn VCF 9.1.1 Lab - No Automation"
$NestedESXiMGMTCapacityvDisk = "3000"
```

The JSON generator adds `vcfAutomationSpec` only when `$DeployVCFAutomation` is true and verifies that the section is absent when Automation is disabled. This allowed the five core deployment stages to proceed without Day-0 Automation.

## The Successful VCF 9.1.1 Run

Because Automation was omitted from the specification, the final workflow contained five stages. After I reapplied the custom HCL to the rebuilt Installer, all five stages completed successfully.

| Stage | Result | Duration |
| --- | ---: | ---: |
| Configure vSphere cluster | 133 of 133 | 5m 11s |
| Deploy and configure NSX | 99 of 99 | 29m 35s |
| Deploy and configure VCF Management Platform | 14 of 14 | 2h 29m 53s |
| Deploy and configure VCF Operations | 15 of 15 | 1h 21m 30s |
| Deploy and configure VCF Management Services | 18 of 18 | 1h 26m 37s |

All five stages completed with zero failed tasks. One Software Depot task logged a `SocketTimeoutException`, but the subsequent metadata upload succeeded, so the warning was nonfatal.

{{< lab-product-image src="/images/vcf/vcf-9-1-1-single-node-homelab/02-successful-task-details.png" alt="Expanded VCF Installer result showing all stages successful, zero failed tasks, and a nonfatal Software Depot timeout warning" caption="The expanded result confirms the completed stages and shows why the isolated Software Depot timeout was nonfatal." width="1000px" height="auto" variant="technical" >}}

## The Three-VM Management Services Footprint

My VCF 9.1 deployment used four Management Services VMs, while VCF 9.1.1 settled at three `vcf-msr01-*` VMs. Removing one runtime VM does not eliminate contention, but it provides useful headroom in a single-node lab where every management appliance shares the same physical resources.

## What I Learned from the Rebuild

The outer ESXi host and vCenter were essential recovery tools when the nested environment became unresponsive. Before deleting a registered deployment, I would again clean up its Business Services Console registration, license allocations, and License Server.

For a new VCF 9.1.1 nested deployment, I would add `skipHclAutoDiskClaim` to the original JSON instead of replacing the Installer HCL. The controlled Automation retry also showed that the incomplete runtime record was not the only problem. In this single-node lab, a stable core deployment without Automation was the better outcome.

VCF 9.1.1 is now running on one physical node with a healthy three-host management domain and three-VM Management Services runtime. Next, I plan to deploy the Virtual Network Appliance, enable Supervisor, and work toward a VKS workload cluster.
