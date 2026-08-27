+++
title = "Deploying a VCF 9.1 Supervisor on a One-Node Nested Lab: VLAN Trunking, Large VNA, and the Tiny-to-Small Fix"
date = "2026-08-27"
draft = false
slug = "deploying-vcf-9-1-supervisor-one-node-nested-lab-vlan-trunking-large-vna"
description = "How I rebuilt my nested VCF 9.1 management domain without Automation, restored VLAN trunking, deployed a Large VNA, and fixed a resource-starved Supervisor."
images = ["/images/vcf/vcf-9-1-large-vna-supervisor/35-supervisor-running-final-status.png"]
featureimage = "images/vcf/vcf-9-1-large-vna-supervisor/35-supervisor-running-final-status.png"
hideFeatureImage = true
keywords = ["VCF 9.1 Supervisor", "VCF 9.1 homelab", "Large VNA", "NSX VPC", "Nested ESXi networking", "vSphere Supervisor", "Spherelet", "vSphere Kubernetes Service"]
tags = ["VCF", "VMware Cloud Foundation", "VCF 9.1", "Home Lab", "Nested ESX", "NSX", "VNA", "vSphere Supervisor", "VKS"]
categories = ["Home Lab"]

showDate = true
showReadingTime = true
showWordCount = false
showTableOfContents = true
+++

At the end of my [previous VCF 9.1 homelab article](/homelab/deploying-a-complete-vcf-9-1-management-domain-nested-esxi-nsx-recovery-and-automation/), one physical MINISFORUM MS-A2 was running a complete nested management domain, including VCF Automation. That deployment proved the full stack could run. It also showed me that proving something once and keeping it as the best platform for the next experiment are two different goals.

The next milestone was a healthy vSphere Supervisor backed by NSX VPC networking. Automation and six nested hosts consumed headroom that I now needed for a Virtual Network Appliance (VNA), its load-balancer services, and a Kubernetes control plane. I powered off and deleted the old nested ESXi VMs and Installer, retained the physical ESXi host, outer vCenter, datastore, router, DNS design, and addressing plan, then rebuilt only the three-host management domain. This time the generated JSON omitted VCF Automation completely.

The rebuild was only the beginning. I reconstructed the nested VLAN path across both virtualization layers, deployed a Large VNA, worked around an unsupported AMD Ryzen model check inside that VNA, and followed Supervisor failures through content libraries, vLCM, Spherelet, registry timeouts, and Kubernetes leader-election failures. The decisive change was surprisingly small: resizing the Supervisor control plane from Tiny to Small. After that one-way resize, both **Config Status** and **Host Config Status** reached **Running**.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/35-supervisor-running-final-status.png" alt="vSphere Supervisor Management showing Config Status and Host Config Status both Running" caption="The final state on August 27: the Supervisor and all three nested hosts were Running, ready for the next VKS phase." width="1000px" height="auto" variant="technical" >}}

{{< alert icon="triangle-exclamation" >}}
**LAB CONTEXT:** This environment runs on one physical AMD Ryzen host. The VNA CPU-model edit, manual Spherelet installation, and silenced virtual-NVMe health finding were troubleshooting steps for this nested lab. They are not production guidance, do not make the underlying hardware supported, and should not replace Broadcom documentation or Support.
{{< /alert >}}

## Why I Rebuilt the Management Domain

The earlier six-host design was useful because it gave me a complete management domain plus three future workload hosts. VCF Automation also worked after several recovery steps. For the Supervisor phase, however, that breadth had become a resource tax. There was no value in continuing to repair and rebalance a topology that no longer matched the immediate goal.

I kept the physical foundation intact:

- the physical ESXi 9.1 host on the MS-A2
- the outer vCenter at `vc01.lab.devynharrington.com`
- the `nested-vcf` backing datastore
- the `192.168.88.0/24` management network
- the MikroTik gateway, DNS, and established VCF addresses

I recreated `inst01` and only `nested-esx01` through `nested-esx03`. Each nested host ended at 24 vCPUs, 80 GB of RAM, a 32 GB vSAN cache disk, and a 1,000 GB thin-provisioned capacity disk. My first 16-vCPU and 64-GB sizing was not enough for the Installer's capacity checks. A separate attempt to set 24 vCPUs while retaining 16 cores per socket failed because `configSpec.numCoresPerSocket` must divide the total vCPU count. I corrected the topology to 24 cores per socket.

```powershell
$DeploymentPhase = "Infrastructure"
$DeployVCFAutomation = $false
$NestedESXiMGMTvCPU = "24"
$NestedESXiMGMTvMEM = "80"
$NestedESXiMGMTCachevDisk = "32"
$NestedESXiMGMTCapacityvDisk = "1000"
```

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/01-no-automation-rebuild-sizing.png" alt="PowerShell deployment summary for three 24-vCPU 80-GB nested hosts with VCF Automation disabled" caption="The rebuilt management domain used three 24-vCPU, 80-GB hosts and deliberately disabled Automation." width="900px" height="auto" variant="technical" >}}

I used a distinct configuration, `devyn-vcf-9.1-no-automation-1tb.ps1`, and added an explicit `GenerateJson` phase to the driver. That let me generate and inspect a fresh management-domain specification without redeploying infrastructure that was already correct or automatically beginning bring-up.

```powershell
./vcf-automated-fleet-deployment-no-automation-v2.ps1 `
  -EnvConfigFile ./devyn-vcf-9.1-no-automation-1tb.ps1 `
  -Phase GenerateJson
```

The important JSON check was structural. Setting a fictional `enabled: false` value inside `vcfAutomationSpec` would still leave an object the schema could try to validate. For a no-Automation deployment, the generated specification omitted `vcfAutomationSpec` entirely.

Fresh ESXi deployments also meant fresh TLS certificates. I recollected every SHA-256 fingerprint with `openssl` and inserted it into a newly named JSON file. One character mattered: the fingerprint for `nested-esx01` ended in `D8`, not `DB`. Installer validation accepted hosts 2 and 3 but continued rejecting host 1 until I corrected that transcription.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/02-installer-json-thumbprint-validation.png" alt="VCF Installer JSON validation showing nested ESXi certificate-thumbprint errors" caption="The new hosts had new certificates, so the old JSON thumbprints could not be reused." width="900px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/03-installer-host-capacity-validation.png" alt="VCF Installer capacity validation for the rebuilt nested management hosts" caption="Installer capacity validation drove the final 24-vCPU and 80-GB sizing rather than guesswork." width="900px" height="auto" variant="technical" >}}

The Installer then hit a separate lab-specific failure: `/tmp/vcf-installer-vsan-hcl.json` was missing even though the source vSAN HCL database existed. I validated the source JSON and copied it to the exact temporary path expected by the failed workflow before retrying.

```shell
jq empty /nfs/vmware/vcf/nfs-mount/vsan-hcl/all.json
cp --preserve=mode,ownership \
  /nfs/vmware/vcf/nfs-mount/vsan-hcl/all.json \
  /tmp/vcf-installer-vsan-hcl.json
ls -lh /tmp/vcf-installer-vsan-hcl.json
```

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/04-vsan-hcl-temporary-file-workaround.png" alt="VCF Installer shell showing the validated vSAN HCL file copied to the expected temporary path" caption="The source HCL JSON was valid; copying it to the missing temporary path allowed me to retry that exact failed workflow." width="900px" height="auto" variant="technical" >}}

I also let the long **Monitor VCF Management Services Deployment Task** continue. It eventually advanced into Software Depot deployment. As in the previous build, slow progress was not proof of a dead workflow.

## The Addressing Plan I Preserved

Reusing the earlier addressing made the rebuild easier to reason about, but I still verified every layer instead of assuming a familiar address meant the same function.

| Object | Name or FQDN | Address or role |
|---|---|---|
| Physical vCenter | `vc01.lab.devynharrington.com` | Outer lab control plane |
| Nested vCenter | `vc01.vcf.lab.devynharrington.com` | VCF management-domain vCenter |
| VCF Installer | `inst01.vcf.lab.devynharrington.com` | `192.168.88.50` |
| Nested ESXi 1 | `nested-esx01.vcf.lab.devynharrington.com` | `192.168.88.41` |
| Nested ESXi 2 | `nested-esx02.vcf.lab.devynharrington.com` | `192.168.88.42` |
| Nested ESXi 3 | `nested-esx03.vcf.lab.devynharrington.com` | `192.168.88.43` |
| NSX Manager | `nsx01a.vcf.lab.devynharrington.com` | `192.168.88.61` |
| VNA | `vna01.vcf.lab.devynharrington.com` | `192.168.88.90` |
| Supervisor API | floating endpoint | `192.168.88.91:6443` |
| Supervisor control-plane VM | `SupervisorControlPlaneVM (1)` | `192.168.88.180` management; `172.30.0.2` pod/VPC |
| Supervisor | `vcf-mgmt-supervisor01` | UI showed control-plane node address `10.1.35.6` |

| Network or object | VLAN | CIDR or gateway | Purpose |
|---|---:|---|---|
| Management | native/outer management | `192.168.88.0/24` | Physical and nested management |
| vMotion | lab port group | `10.1.32.0/24` | Nested-host vMotion |
| vSAN | lab port group | `10.1.33.0/24` | Nested vSAN |
| NSX TEP | `2005` | `10.1.34.0/24` | Overlay underlay, MTU 8940 |
| Distributed external | `2006` | gateway `10.1.35.1/26` | North-south external path |
| Private VPC | n/a | `172.30.0.0/16` | VPC workload and pod space |
| Kubernetes services | n/a | `172.29.0.0/16` | Service VIPs; Kubernetes at `172.29.0.1:443` |
| Private Transit Gateway | n/a | `172.31.0.0/16` | Day-0 private TGW allocation |

The resulting path looked like this:

<div class="article-wide-mermaid" role="region" aria-label="Scrollable VCF nested lab architecture diagram" tabindex="0">

{{< mermaid >}}
flowchart LR
  R["MikroTik<br/>192.168.88.1"] --> O["Physical ESXi + outer vCenter"]
  O -->|"VM Network<br/>adapters 1/2"| M["Nested management<br/>vmnic0/vmnic1"]
  O -->|"VCF-Trunk VLAN 4095<br/>adapters 3/4"| U["vmnic2 → uplink1<br/>vmnic3 → uplink2"]
  U --> T["Host TEPs<br/>VLAN 2005 / 10.1.34.0/24"]
  T --> D["Distributed TGW"]
  D --> E["VCF-DTGW-External<br/>VLAN 2006 / 10.1.35.1/26"]
  D --> V["Large VNA<br/>192.168.88.90"]
  V --> S["Supervisor API VIP<br/>192.168.88.91:6443"]
  S --> P["VPC 172.30.0.0/16<br/>Services 172.29.0.0/16"]
{{< /mermaid >}}

</div>

## Reconstructing Networking Across Two Virtualization Layers

Nested networking becomes confusing when a virtual NIC, an ESXi `vmnic`, a VDS uplink, and a VMkernel adapter are treated as interchangeable. They are four different objects along one path.

| Outer nested-VM device | Outer port group | Device inside nested ESXi | Inner VDS assignment | Function |
|---|---|---|---|---|
| Network adapter 1 | `VM Network` | `vmnic0` | bootstrap/legacy, not final transport uplink | Management/bootstrap |
| Network adapter 2 | `VM Network` | `vmnic1` | bootstrap/legacy, not final transport uplink | Management/bootstrap |
| Network adapter 3 | `VCF-Trunk` VLAN 4095 | `vmnic2` | `uplink1` | Tagged VCF and NSX traffic |
| Network adapter 4 | `VCF-Trunk` VLAN 4095 | `vmnic3` | `uplink2` | Tagged VCF and NSX traffic |

### Outer vCenter: Preserve Management and Add the Trunk

On the physical vCenter, every nested ESXi VM had four virtual NICs. I left adapters 1 and 2 on `VM Network`, moved adapters 3 and 4 to `VCF-Trunk`, and kept all four connected. The outer `VCF-Trunk` port group used VLAN ID 4095, VMware's virtual-guest-tagging mode for passing guest-generated 802.1Q tags.

There was no reason to move the management adapters onto the trunk merely to make the settings symmetrical. Their existing untagged management path worked. The trunk pair had a different job: carry the tagged networks produced inside the nested environment.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/05-outer-nested-esxi-adapter-port-groups.png" alt="Outer vCenter showing nested ESXi adapters 1 and 2 on VM Network and adapters 3 and 4 on VCF-Trunk" caption="At the outer layer, adapters 1 and 2 retained management while adapters 3 and 4 carried the VLAN-4095 trunk." width="850px" height="auto" variant="technical" >}}

### Inner vCenter: Map vmnics to Uplinks

Inside each nested ESXi host, those four virtual devices enumerated as `vmnic0` through `vmnic3`. I used the VDS workflow to replace the original `vmnic0`/`vmnic1` assignments with the trunk-backed transport pair recorded in my deployment notes: `vmnic2` to `uplink1` and `vmnic3` to `uplink2` across all three hosts. The final host view below confirms that `vmnic2` and `vmnic3` are attached to `sddc1-cl01-vds01`, while `vmnic0` and `vmnic1` are no longer attached to a switch. This particular view proves the selected transport devices, but it does not display the logical `uplink1` and `uplink2` slot names.

A `vmnic` is the ESXi device. An uplink is the VDS's logical slot for that device. A VMkernel adapter such as `vmk1` is an IP endpoint using a port group carried by those uplinks.

I did not blindly migrate `vmk0`. Losing the working management path while editing the transport path would have turned a controlled network change into a recovery exercise.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/06-final-vds-transport-vmnics-cropped.png" alt="Cropped nested ESXi physical-adapter table showing vmnic2 and vmnic3 attached to sddc1-cl01-vds01 and vmnic0 and vmnic1 detached" caption="The final host view confirms the trunk-backed transport pair: vmnic2 and vmnic3 are attached to the VDS, while vmnic0 and vmnic1 show no switch. Select the image to inspect it at full resolution." width="1000px" height="auto" variant="technical" >}}

The VMkernel map was equally deliberate:

| VMkernel | Service | Network | Host 1 | Host 2 | Host 3 | MTU / stack |
|---|---|---|---|---|---|---|
| `vmk0` | Management | `192.168.88.0/24` | `.41` | `.42` | `.43` | 1500 / default |
| `vmk1` | vMotion | `10.1.32.0/24` | `.101` | `.102` | `.103` | 1500 / vMotion |
| `vmk2` | vSAN | `10.1.33.0/24` | `.101` | `.102` | `.103` | 1500 / default |
| `vmk10` | NSX TEP | VLAN 2005, `10.1.34.0/24` | `.103` | `.101` | `.105` | 8940 / vxlan |
| `vmk11` | NSX TEP | VLAN 2005, `10.1.34.0/24` | `.104` | `.102` | `.106` | 8940 / vxlan |
| `vmk50` | system internal | `169.254.0.0/16` | `169.254.1.1` | same | same | auto-created |

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/07-nested-esxi-vmkernel-addressing.png" alt="ESXi shell showing management vMotion vSAN TEP and internal VMkernel addresses" caption="The VMkernel inventory separated the services and confirmed the intended addresses before Supervisor work began." width="1000px" height="auto" variant="technical" >}}

### Proving the Underlay Without Overclaiming

I verified the physical-adapter and VMkernel state, then ran TEP, vMotion, and vSAN tests from the correct stacks and interfaces.

```shell
esxcli network nic list
esxcli network ip interface ipv4 get

vmkping -S vxlan -I vmk10 -d -s 1572 10.1.34.103
vmkping -S vxlan -I vmk11 -d -s 1572 10.1.34.104
vmkping -S vmotion -I vmk1 10.1.32.102
vmkping -I vmk2 10.1.33.102
```

All TEP pairs returned zero packet loss. The 1,572-byte payload with do-not-fragment demonstrated that the TEP underlay could carry more than a 1,600-byte frame once headers were included. The vMotion and vSAN pings proved reachability on those VMkernel paths.

They did **not** prove every later Kubernetes service, registry, NAT, or VNA path. That limitation mattered when registry timeouts later tempted me to blame the trunk.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/08-nsx-tep-jumbo-vmkping.png" alt="Nested ESXi vmkping over the vxlan stack with a 1572-byte payload and zero loss" caption="A successful do-not-fragment TEP test proved jumbo transport between these endpoints, not the health of every Supervisor service path." width="900px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/09-vmotion-vsan-vmkping.png" alt="Nested ESXi shell showing successful vMotion and vSAN VMkernel pings" caption="The vMotion and vSAN VMkernel paths also passed with zero packet loss." width="900px" height="auto" variant="technical" >}}

## Building the Distributed External Path

Before activating Supervisor, the distributed Transit Gateway needed a real exit and the VPC connectivity profile needed a service gateway, external addresses, and NAT.

Under **Configure > Networking > External Connections**, I created a **Distributed VLAN Connection**, not a centralized Tier-0/Edge connection:

| Field | Value |
|---|---|
| Name | `VCF-DTGW-External` |
| Type | Distributed VLAN Connection |
| Dedicated to Subnet | Off |
| VLAN ID | `2006` |
| Gateway CIDR IPv4 Address | `10.1.35.1/26` |

The completed object showed **Success**, one attached Transit Gateway, and the expected VLAN/gateway pair.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/16-distributed-external-connection-success.png" alt="vSphere distributed external connection VCF-DTGW-External showing Success on VLAN 2006" caption="VCF-DTGW-External connected the distributed Transit Gateway to VLAN 2006 at 10.1.35.1/26." width="1000px" height="auto" variant="technical" >}}

The initial Default VPC Connectivity Profile still reported four incompatibilities: Service Gateway disabled, automatic SNAT disabled, no external IP block, and no Edge/VNA resource path. I created `VCF-External-IP-Block`, retained `Day0 Private Tgw Ip Block` (`172.31.0.0/16`), selected `vna-cluster01`, enabled north-south services, enabled Default Outbound NAT, and selected the external block for that NAT.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/17-vpc-profile-incompatibility-reasons.png" alt="Default VPC Connectivity Profile showing four incompatibility reasons before VNA NAT and external IP configuration" caption="The incompatibility dialog made the missing north-south prerequisites explicit." width="850px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/18-default-vpc-connectivity-profile.png" alt="Default VPC Connectivity Profile with vna-cluster01 north-south services outbound NAT and external IP block selected" caption="Selecting the VNA, north-south services, outbound NAT, and external block cleared the profile incompatibilities." width="850px" height="auto" variant="technical" >}}

Broadcom's [Supervisor with VPC troubleshooting guidance](https://knowledge.broadcom.com/external/article/452173) documents how incomplete workload networking, routing, and MTU can surface as image-registry and core-service failures. That is why I completed these objects and validated the trunk before asking Supervisor to deploy.

## Why I Deployed a Large VNA

The form factors shown by the VNA wizard were Small at 2 vCPUs/4 GB, Medium at 4 vCPUs/8 GB, Large at 8 vCPUs/32 GB, and Extra Large at 16 vCPUs/64 GB. A previous Small VNA reached 100 percent logical load-balancer capacity even with a Tiny Supervisor. A Medium attempt still did not produce a successful result in this lab. I therefore used Large for the repeatable final attempt.

Logical load-balancer capacity is not the same as guest CPU utilization. It is a capacity and reservation model. Broadcom's [LB Edge Capacity alarm explanation](https://knowledge.broadcom.com/external/article/322486) describes the alarm as capacity usage against the node's load-balancer capacity, with a default warning threshold of 80 percent. The Large profile prevented the earlier capacity blocker here; it does not establish Large as a universal Supervisor requirement.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/10-vna-form-factor-capacity.png" alt="VNA form-factor descriptions for Small Medium Large and Extra Large" caption="I selected Large, 8 vCPUs and 32 GB, after the smaller profiles failed to produce a usable result in this lab." width="850px" height="auto" variant="technical" >}}

| VNA setting | Final value |
|---|---|
| Cluster | `vna-cluster01` |
| Node form factor | Large, 8 vCPUs and 32 GB RAM |
| Node FQDN | `vna01.vcf.lab.devynharrington.com` |
| Management address | static `192.168.88.90/24` |
| Gateway | `192.168.88.1` |
| vSphere cluster | `vcf-mgmt-cl01` |
| Datastore | `vsanDatastore` |
| Management port group | `DVPG_FOR_VM_MANAGEMENT` |

A one-node VNA cluster was acceptable for this one-physical-host proof of concept. It does not provide physical high availability. Adding a second virtual node on the same physical MS-A2 would not protect the service from failure of that host.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/11-large-vna-deployment-summary.png" alt="Add Virtual Network Appliance Cluster summary showing a Large vna01 node" caption="The saved deployment contained one Large VNA node in vna-cluster01, appropriate for the physical constraints but not physically redundant." width="850px" height="auto" variant="technical" >}}

### The Unsupported Ryzen CPU Check

The appliance booted on the AMD Ryzen 9 9955HX, but NSX Edge configuration stopped with:

```text
NSX Edge configuration has failed. Unsupported CPU: AMD Ryzen 9 9955HX 16-Core Processor
```

The check in `/opt/vmware/nsx-edge/bin/config.py` accepted AMD EPYC model strings but rejected Ryzen. I backed up the script before changing anything.

```shell
cp -p /opt/vmware/nsx-edge/bin/config.py \
  /opt/vmware/nsx-edge/bin/config.py.pre-ryzen-workaround
ls -lh /opt/vmware/nsx-edge/bin/config.py*
grep -n -A2 -B2 'Unsupported CPU|AMD EPYC' \
  /opt/vmware/nsx-edge/bin/config.py
```

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/12-vna-unsupported-ryzen-cpu-error.png" alt="VNA console showing NSX Edge configuration failed because the AMD Ryzen CPU was unsupported" caption="The VNA rejected the Ryzen model string even though the appliance had booted." width="900px" height="auto" variant="technical" >}}

The lab-only edit commented the conditional model-name check and its `self.error_exit` call around lines 221 and 222. I did not remove the backup. I verified the edit and rebooted the VNA because retrying the service without a reboot did not re-run the full initialization path.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/13-vna-config-py-ryzen-workaround.png" alt="VNA shell showing the backed-up config.py and commented Ryzen CPU model rejection lines" caption="I preserved the original file and bypassed only the model-string enforcement in this unsupported nested lab." width="1000px" height="auto" variant="technical" >}}

After reboot, `/config/vmware/edge/config.json` existed. The `service_datapath`, `service_dispatcher`, `service_rcpm`, `service_rsd`, and `service_nsxa` containers were Up, and `systemctl --failed` returned no failed units. A temporary L2 configuration failure appeared during convergence, and the node briefly showed Degraded/Down while HA was Admin Down on the single-node cluster. I watched it rather than rebuilding again. Manager, controller, tunnel, proxy, and storage connectivity recovered, and the VNA converged to **1 Up / Success**.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/14-vna-services-after-reboot.png" alt="VNA shell showing NSX service containers running and no failed systemd units after reboot" caption="The reboot re-ran initialization; the service containers were Up and systemd reported no failed units." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/15-vna-cluster-up-success.png" alt="VNA cluster vna-cluster01 showing one node Up and deployment status Success" caption="The transient degraded state cleared and the one-node VNA cluster reached 1 Up / Success." width="1000px" height="auto" variant="technical" >}}

## Preparing the Supervisor

I created a subscribed Supervisor content library on `vsanDatastore` with immediate download from:

```text
https://wp-content.broadcom.com/supervisor/v1/latest/lib.json
```

The vSphere Client initially appeared empty. Creating `supervisor-library-v2` while troubleshooting did not solve that display delay, so I used PowerCLI to verify the state behind the UI. It showed the original `supervisor-library`, the duplicate, a separate Kubernetes Service Content Library, Supervisor images `supervisor-9.0.0.0100-24845085` and `supervisor-9.0.2.0100-25262241`, and Spherelet items for Kubernetes versions 1.28 through 1.32.

```powershell
Get-ContentLibrary |
  Format-Table Name, Type, SubscriptionUrl -AutoSize

$library = Get-ContentLibrary -Name supervisor-library-v2
Get-ContentLibraryItem -ContentLibrary $library |
  Format-Table Name, Type, Size -AutoSize
```

Once the client caught up, I assigned the original 11.8-GB `supervisor-library` under **Supervisor Management > Content Distribution**. The duplicate was not part of the final deployment.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/19-supervisor-library-powercli-verification.png" alt="PowerCLI showing subscribed Supervisor libraries and downloaded Supervisor and Spherelet items" caption="PowerCLI proved the subscribed libraries and items existed even while the vSphere Client appeared empty." width="900px" height="auto" variant="technical" >}}

The Supervisor wizard used these values:

| Wizard area | Value |
|---|---|
| Name / cluster | `vcf-mgmt-supervisor01` / `vcf-mgmt-cl01` |
| Networking | VCF Networking with VPC |
| Storage | `vcf-mgmt-cl01 - Optimal Datastore Default Policy - AutoRAID` for control plane, ephemeral disks, and image cache |
| Management network | DHCP on `DVPG_FOR_VM_MANAGEMENT` |
| API floating IP | `192.168.88.91` |
| DNS / search / NTP | `192.168.88.1` / `vcf.lab.devynharrington.com` / `time.google.com` |
| Private VPC CIDR | `172.30.0.0/16` |
| Service CIDR | `172.29.0.0/16` |
| Initial control-plane size | Tiny, 2 vCPUs, 8 GB RAM, 48 GB storage |
| HA | Disabled; one control-plane VM |

I left the optional API Server DNS Name blank because the evidence did not include a deliberately created DNS record for it. I also exported the configuration before selecting Finish so I would have the exact inputs for comparison and a future deployment.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/20-supervisor-wizard-summary.png" alt="Supervisor activation summary with storage management workload and advanced settings" caption="The exported wizard state captured the Tiny control plane, DHCP management network, API VIP, and VPC/service CIDRs before activation." width="850px" height="auto" variant="technical" >}}

## Following the Supervisor Failures

The deployment created its control-plane VM, configured management and workload networking, and configured the Supervisor API load balancer. Then core services began failing. `tkg.vsphere.vmware.com` and `velero.vsphere.vmware.com` reported timeouts reaching the internal registry:

```text
docker-registry.kube-system.svc:5000 ... i/o timeout
```

Those symptoms resemble the network failure described in [Broadcom KB 452173](https://knowledge.broadcom.com/external/article/452173), so it was reasonable to re-check the network. It was not reasonable to declare that the root cause without reconciling the successful TEP tests, working API VIP, and later in-cluster observations.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/21-supervisor-core-service-reconcile-error.png" alt="Supervisor core service configuration showing tanzu-auth and Velero reconciliation failures" caption="Core Supervisor services failed while attempting to reach the internal registry, initially pointing back toward the network." width="1000px" height="auto" variant="technical" >}}

### What HTTP 401 Proved

I repeatedly called the API VIP at `192.168.88.91:6443`:

```shell
for i in $(seq 1 10); do
  curl -k -sS --connect-timeout 5 --max-time 15 -o /dev/null \
    -w 'HTTP=%{http_code} TOTAL=%{time_total}s\n' \
    https://192.168.88.91:6443/readyz
  sleep 2
done
```

The endpoint quickly returned HTTP 401. That is an authentication rejection, not a connection failure. It proved that my client could reach an HTTPS server at the API VIP and receive an application response. It did not prove every internal service request was healthy.

PowerCLI discovered `SupervisorControlPlaneVM (1)` and its management address, `192.168.88.180`. That was separate from the floating API address `.91`. The UI also showed the control-plane node at `10.1.35.6`, while the VM carried `172.30.0.2` on the VPC/pod side. Treating those values as one interchangeable "Supervisor IP" would have obscured the route being tested.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/28-supervisor-api-http-401-connectivity.png" alt="curl to the Supervisor API readyz endpoint returning HTTP 401" caption="A fast 401 response showed that the API VIP was reachable even though the unauthenticated request was rejected." width="850px" height="auto" variant="technical" >}}

### Host Configuration Stopped at 0 of 12

All three hosts stalled at **Installed and Started Kubernetes Node Agent on the ESXi Host**, with Host Configuration at 0 of 12 conditions. Spherelet was not running, `/etc/vmware/spherelet` contained zero-byte configuration files, and its log was empty.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/22-supervisor-host-configuration-zero-of-twelve.png" alt="Supervisor Configuring Host Nodes dialog showing all three nested hosts stalled at 0 of 12 conditions" caption="The Supervisor control plane existed, but no nested host had completed the first host-configuration condition." width="900px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/23-spherelet-zero-byte-configuration.png" alt="Nested ESXi shell showing Spherelet absent or stopped with zero-byte configuration files" caption="Spherelet had no usable configuration, which explained why manually starting a service was not enough." width="900px" height="auto" variant="technical" >}}

The desired cluster image was missing the Spherelet VIB required by **VMware vSphere with Kubernetes - Supervisor Cluster 9.0.1.32.5.0-25510706**. vLCM reported remediation was required. Its pre-check also warned that the custom `nested-esxi-customization` VIB could be removed and that the virtual NVMe device failed hardware compatibility. Broadcom's [vLCM VIB behavior guidance](https://knowledge.broadcom.com/external/article/90188) reinforces why image remediation and manually added packages need to be evaluated together. A blind remediation could remove the VIB that makes this nested appliance usable.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/24-vlcm-supervisor-image-compliance.png" alt="vSphere Lifecycle Manager image compliance warning for the Supervisor solution and nested ESXi hosts" caption="The desired-state image required remediation, but the pre-check also warned about nested customizations and hardware compatibility." width="1000px" height="auto" variant="technical" >}}

I found the exact Spherelet VIB in the vCenter patch store, copied it to `nested-esx01`, and installed it as a diagnostic step:

```text
/storage/updatemgr/patch-store/hostupdate/vmw/vib20/spherelet/
VMware_bootbank_spherelet_9.0.1.32.5.0-25510706.vib
```

```shell
esxcli software vib install \
  -v /tmp/VMware_bootbank_spherelet_9.0.1.32.5.0-25510706.vib
esxcli software vib list | grep -i spherelet
```

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/25-manual-spherelet-vib-installation.png" alt="Nested ESXi shell showing successful installation and listing of the Spherelet VIB" caption="The exact VIB installed without a reboot, but the Spherelet and WCP Management Proxy services remained stopped." width="1000px" height="auto" variant="technical" >}}

The installation succeeded, yet the services stayed stopped and the configuration files remained empty. That result was useful: the VIB was only one piece. The supported desired-state workflow still had to create credentials and configuration and start the agents. Manual package installation was not the solution.

### The Nested NVMe Finding

The vSAN health check **NVMe device is VMware certified** flagged the VMware virtual NVMe controller, VID `15ad` and DID `07f0`, on all three hosts. This was intentionally emulated hardware in a nested lab. I silenced that specific finding so it would not continue gating the lab workflow.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/26-nested-nvme-vsan-health-finding.png" alt="vSAN health finding showing the VMware virtual NVMe controller as not certified on three nested hosts" caption="The warning described the virtual controller accurately; silencing it prevented repeated lab gating but did not certify the device." width="1000px" height="auto" variant="technical" >}}

Silencing an alarm changes its reporting behavior. It does not add a controller to the hardware compatibility list or make the design suitable for production. After clearing that nested-only gate, I let the image-solution and compliance workflows continue without blindly applying a full remediation that could remove `nested-esxi-customization`.

## The Decisive Evidence Was Inside the Control Plane

Once host configuration progressed, TKG still oscillated among Configuring, Reconciling, and ReconcileFailed. I moved the investigation into the control-plane VM.

The in-cluster `kubernetes` service was `172.29.0.1:443`, with endpoint `10.1.35.6:6443`. A 30-iteration request loop to `https://172.29.0.1:443/readyz` mostly returned rapid 401 responses. All four Kubernetes nodes were Ready, none reported MemoryPressure, DiskPressure, or PIDPressure, and `kube-proxy` was Running.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/29-kubernetes-service-endpoint-tests.png" alt="Supervisor control-plane shell repeatedly reaching the internal Kubernetes service endpoint" caption="The internal service path worked repeatedly between stalls, which argued against a total routing failure." width="900px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/30-supervisor-node-readiness-resource-pressure.png" alt="kubectl node output showing Supervisor nodes Ready with no memory disk or PID pressure" caption="Kubernetes node conditions were healthy even while controllers and packages remained unstable." width="1000px" height="auto" variant="technical" >}}

The controller evidence told a different story. Calls to `172.29.0.1:443` sometimes exceeded their deadlines, controllers lost leader election, probes timed out or received connection refused, and `capi-kubeadm-bootstrap` had restarted 168 times.

```text
Failed to update lock optimistically ... context deadline exceeded
failed to renew lease ... leader election lost
Restart Count: 168
Back-off restarting failed container manager
```

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/27-controller-leader-election-timeouts.png" alt="Supervisor controller logs showing Kubernetes API timeouts and leader-election loss" caption="Controllers were losing leases because API requests missed their deadlines, even though the endpoint also answered successfully between stalls." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/31-supervisor-problem-pods-restarts.png" alt="kubectl pod output showing failing Supervisor pods and high restart counts" caption="The restart counts and failed health probes turned an intermittent UI symptom into evidence of control-plane instability." width="1000px" height="auto" variant="technical" >}}

The Tiny control-plane VM had only 2 vCPUs and 8 GB of RAM. During reconciliation, its load average ranged roughly from 19 to 35. CPU0 reached 100 percent, CPU1 approached 90 percent, and approximately 6.8 of 7.7 GiB was in use. This pattern explained the contradiction: networking could work, but an overloaded API server could still answer too slowly for leader leases, probes, registry pulls, and reconciliation deadlines.

I treat that as the root cause strongly supported by this lab's evidence, not as a universal product statement. The important correlation was sustained pressure, repeated controller failure, intermittent success on the same endpoints, and convergence immediately after adding control-plane resources.

## The Tiny-to-Small Fix

Under **vcf-mgmt-supervisor01 > Configure > General > Control Plane**, I changed the control-plane size from Tiny to Small:

| Size | vCPU | Memory | Storage |
|---|---:|---:|---:|
| Tiny, original | 2 | 8 GB | 48 GB |
| Small, final | 4 | 16 GB | 48 GB |

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/32-supervisor-control-plane-tiny-size.png" alt="Supervisor General settings showing the original Tiny two-vCPU eight-GB control-plane size" caption="Tiny was the original choice, but two vCPUs were saturated during package and service reconciliation." width="850px" height="auto" variant="technical" >}}

The UI warned that I would not be able to scale down to a smaller size after saving. I accepted that one-way decision and let desired state reconfigure the VM. I did not reboot or delete the control-plane VM manually.

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/33-supervisor-resize-one-way-warning.png" alt="Supervisor control-plane resize dialog warning that the size cannot be scaled back down" caption="The resize was a one-way UI operation, so I acknowledged the warning before saving." width="850px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-large-vna-supervisor/34-supervisor-control-plane-small-size.png" alt="Supervisor General settings showing the Small four-vCPU sixteen-GB control-plane size" caption="Small doubled the control plane to 4 vCPUs and 16 GB while retaining 48 GB of storage." width="850px" height="auto" variant="technical" >}}

The status did not become perfect instantly. During reconciliation, completed conditions temporarily regressed from 8 of 9 to 7 of 9 while the control-plane VM and workload network were reconfigured. Then the core services turned green, the control-plane condition completed, and host configuration converged across all three nested ESXi hosts.

That progression is why resizing is the primary resolution narrative. A Large VNA had removed the earlier logical load-balancer-capacity blocker. The distributed external connection, VPC profile, NAT, trunk, and TEP paths were already in place. Clearing the nested hardware gate allowed desired state to move forward. The Tiny-to-Small change finally gave the Kubernetes control plane enough headroom to keep its API and controllers responsive through reconciliation.

## Final Validation

Before calling the deployment complete, I verified the outcome at each layer:

- `vna-cluster01` showed one node Up and deployment state Success.
- `VCF-DTGW-External` showed Success on VLAN 2006 with gateway `10.1.35.1/26`.
- the Default VPC Connectivity Profile had its VNA, north-south services, external IP block, and outbound NAT.
- the Supervisor API load balancer was configured and `192.168.88.91:6443` responded.
- core Supervisor services reached a healthy state.
- all three nested hosts completed their host-configuration conditions.
- **Config Status** became **Running**.
- **Host Config Status** became **Running**.

The Large VNA prevented the load-balancer capacity failure I observed with smaller profiles in this lab. The Small Supervisor control plane resolved the severe CPU pressure and API instability that remained. Neither observation means every VCF 9.1 Supervisor needs those sizes; they are the known-good choices for this one-node nested design.

## What I Learned

- Rebuild when the old topology no longer serves the next objective. Removing Automation created the headroom I needed for VNA and Supervisor work.
- Keep the outer virtual NIC, inner `vmnic`, VDS uplink, and VMkernel layers conceptually separate. Similar names do not make them the same object.
- A passing `vmkping` proves the tested path. It does not certify every application path above it.
- An HTTP 401 can be positive connectivity evidence when authentication is intentionally absent.
- Treat manual VIB installation as a diagnostic unless the complete desired-state workflow also writes configuration and starts the service.
- Silencing a nested hardware alarm does not make virtual hardware certified.
- Logical VNA load-balancer capacity and observed guest CPU are different measurements.
- Intermittent endpoint success plus missed leases, high restart counts, and extreme load can point to resource starvation rather than a total network outage.
- Preserve the state transitions. The brief regression after resizing was part of healthy reconciliation, not a reason to interrupt it.

The lab now has what I was working toward: a functioning VCF 9.1 Supervisor on a single physical host, with VPC networking, north-south services, a healthy VNA, and all nested hosts configured. The next article will use that foundation to deploy and validate **vSphere Kubernetes Service** rather than spending another round rebuilding the platform underneath it.
