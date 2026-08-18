+++
title = "Building My VCF 9.1 Homelab: ESXi, NVMe Memory Tiering, vCenter, and VIS"
date = "2026-08-17"
draft = false
slug = "building-my-vcf-9-1-homelab-bare-metal-esxi-vcenter-vis"
description = "Building my VCF 9.1 homelab foundation on a MINISFORUM MS-A2 with ESXi, NVMe Memory Tiering, vCenter, working NTP, and VIS."
images = ["/images/vcf/ms-a2-day-1/01-physical-lab-stack.jpeg"]
keywords = ["VMware Cloud Foundation 9.1", "VCF 9.1 homelab", "VMware ESXi 9.1", "vCenter 9.1", "MINISFORUM MS-A2", "NVMe Memory Tiering", "Nested VCF", "VMware homelab", "William Lam VIS", "VCF Infrastructure Services Appliance", "VMUG Advantage"]
tags = ["VCF", "VMware Cloud Foundation", "Home Lab", "VMware ESXi", "vCenter", "Nested ESX", "NVMe Memory Tiering", "MINISFORUM MS-A2", "VIS", "VMUG Advantage"]
categories = ["Home Lab"]

showDate = true
showReadingTime = true
showWordCount = false
showTableOfContents = true
+++

This is the third article in my VCF 9.1 home lab build. In the [first article, I documented the architecture, hardware, and cost](/homelab/building-a-single-node-nested-vmware-cloud-foundation-9-1-home-lab/). In the [second, I worked through the MS-A2 refusing to POST with 128 GB of DDR5](/homelab/getting-128gb-ddr5-working-on-the-minisforum-ms-a2-9955hx/) and got the complete kit recognized at 4800 MT/s.

That second article ended with a specific list of next steps: verify the NVMe devices, install the physical hypervisor, confirm that it recognized the hardware, configure NVMe Memory Tiering, connect the MikroTik management network, and start building the platform for nested VCF. This article picks up exactly there.

This was the day the lab stopped being a collection of hardware and diagrams and became a working virtualization platform.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/01-physical-lab-stack.jpeg" alt="MINISFORUM MS-A2, MikroTik router, and CyberPower UPS installed in the compact home lab rack" caption="The physical starting point for the night: the MS-A2, MikroTik infrastructure, and UPS installed in the compact rack. Cable management could wait until the platform worked." width="620px" height="500px" variant="technical" >}}

I started with newly available personal-use licensing and an ESXi ISO. I ended the night with ESXi 9.1 running on the MINISFORUM MS-A2, roughly 640 GB of theoretical tiered memory capacity, vCenter Server 9.1 managing the physical host, healthy DNS and NTP, and William Lam's VCF Infrastructure Services Appliance online. The nested VCF environment itself is not deployed yet. This first build day was about giving it a sound physical foundation.

That distinction matters. This is not a generic ESXi installation guide, and it is not a claim that VCF is already running. It is the record of the design choices, deployment sequence, troubleshooting, and validation that got my specific lab ready for the next phase.

{{< alert icon="worktree" >}}
**LAB DESIGN:** The physical ESXi environment is the launch platform. The VMware Cloud Foundation environment will run as nested infrastructure on top of it.
{{< /alert >}}

## The Goal for This Lab

I am building this environment to do much more than run a few utility VMs. The eventual goal is a nested VMware Cloud Foundation 9.1 platform where I can work through lifecycle operations, VCF Automation, VCF Operations, networking, Kubernetes and VKS, infrastructure services, and whatever other VCF functions become practical as the lab develops.

The physical system is a MINISFORUM MS-A2 with an AMD Ryzen 9 9955HX. It gives me 16 physical cores, 32 logical processors, three ESXi-recognized NICs, and a compact chassis with useful NVMe flexibility. William Lam's [VCF on the MINISFORUM MS-A2](https://williamlam.com/2025/06/vmware-cloud-foundation-vcf-on-minisforum-ms-a2.html) hardware review was a useful reference for its ESXi compatibility, networking, three-device storage layout, and Memory Tiering potential. The BIOS work in the previous article established that my system could recognize the full 128 GB at 4800 MT/s. This build day confirmed that ESXi also recognized the hardware needed to move forward, but it did not replace long-duration memory, thermal, endurance, or workload testing. Those remain ongoing validation items as the environment grows.

Rather than buy several large physical servers immediately, I designed the first node around ESXi NVMe Memory Tiering. The intent is to stretch the memory capacity of one capable host while keeping a clean path to add more physical MS-A2 nodes later.

| Physical component | Configuration |
|---|---|
| System | MINISFORUM MS-A2 |
| Processor | AMD Ryzen 9 9955HX, 16 cores / 32 logical processors |
| Physical memory | 128 GB DDR5 DRAM |
| Hypervisor | VMware ESXi 9.1 |
| Management network | 192.168.88.0/24 |

## Finally Getting VCF Personal-Use Licensing

The build could not start until I could actually obtain the software. I had VMUG Advantage access, but the VCF personal-use licensing available to me required completing the eligibility process that was in place during this build. The [VMUG Advantage Home Lab License Guide](https://blogs.vmware.com/code/2025/03/19/vmug-advantage-home-lab-license-guide/) documents the program and the process for obtaining personal-use licensing.

I first requested access to the licenses. Because I already hold the VCF 9 Administrator certification, I followed the refresher and assessment process associated with that certification. The VMUG Advantage team sent me the access needed for a short assessment of approximately 20 questions. Once I completed the required process, my VCF personal-use licensing became available and I could finally download the VMware ESXi 9.1 installer.

This is the workflow I encountered in August 2026, not a promise that every VMUG Advantage subscriber will always see the same steps. Eligibility and renewal requirements can change, so anyone reproducing the lab should confirm the current program rules. I am also intentionally not publishing keys, codes, or private account information.

I had spent much more time planning the hardware than it took to assemble the software foundation once that gate cleared. With the download available, the project accelerated immediately.

## Preparing the ESXi Installer

I downloaded the ESXi 9.1 ISO after receiving access through the personal-use licensing process, then downloaded Rufus from the [official Rufus website](https://rufus.ie/) and used it to write the ISO to a USB flash drive. The workflow was straightforward: insert the USB drive, launch Rufus, select the correct USB device, select the ESXi ISO, create the bootable media, and then boot the MS-A2 from that device.

Before starting the write, I confirmed the destination device by its capacity and device name because creating the installer overwrites the selected USB drive.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/rufus-official-example.png" alt="Example Rufus interface from the official Rufus website showing an ISO being copied to a USB drive" caption="This is not my screenshot; it is an illustrative example from the official Rufus website. It shows the general Rufus interface and write process, not the ESXi ISO or the exact settings I used for this build." width="430px" height="560px" variant="technical" >}}

## Installing ESXi 9.1 on the MS-A2

I booted the MINISFORUM MS-A2 from the USB installer and installed ESXi 9.1 onto the 2 TB NVMe device. This completed the most immediate software step identified at the end of the previous article. ESXi used that drive for its system partitions, and its remaining capacity became local datastore space.

The installer detected all three Samsung 990 PRO devices and the USB installer. I selected the **1.82 TiB Samsung SSD 990 PRO 2TB** as the installation target. That selection mattered because the neighboring 3.64 TiB and 931.51 GiB devices already had dedicated roles in the design. The installer then warned that the selected disk would be repartitioned. I accepted that warning only after confirming the model and capacity again.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/02-esxi-select-2tb-install-disk.jpeg" alt="VMware ESXi 9.1 installer showing the 2 TB, 4 TB, and 1 TB Samsung 990 PRO devices with the 2 TB device selected" caption="The ESXi installer detected all three NVMe devices. I selected the 1.82 TiB Samsung 990 PRO for the physical hypervisor." width="760px" height="430px" variant="technical" >}}

{{< lab-product-image src="/images/vcf/ms-a2-day-1/03-esxi-confirm-repartition-2tb.jpeg" alt="VMware ESXi 9.1 installer confirmation warning that the selected Samsung 990 PRO 2 TB disk will be repartitioned" caption="The final confirmation identified the exact 2 TB device before ESXi repartitioned it." width="760px" height="430px" variant="technical" >}}

ESXi creates its system layout on the selected disk and uses the remaining eligible space for VMFS. That is why the 2 TB device could serve both as the physical ESXi boot device and as `datastore1`; installing ESXi did not mean losing the entire device to boot partitions.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/04-esxi-installation-complete.jpeg" alt="VMware ESXi 9.1 installer reporting that installation completed successfully" caption="ESXi 9.1 installed successfully and was ready to reboot after removing the USB media." width="760px" height="430px" variant="technical" >}}

After installation, the vSphere interfaces identified the system as **MS-A2** and the processor as **AMD Ryzen 9 9955HX 16-Core Processor**. ESXi saw all 32 logical processors, the full physical memory configuration, three NICs, and the storage devices needed for the planned layout. That moved several items from the previous article's “still need to test” list into the validated column, while stability under sustained nested VCF load remains unproven.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/05-esxi-dcui-hardware-detected.jpeg" alt="VMware ESXi 9.1 DCUI showing the MS-A2, Ryzen 9 9955HX processor, and 125.7 GiB of memory" caption="The first boot confirmed ESXi 9.1 build 25557999, the Ryzen 9 9955HX, and 125.7 GiB of usable physical memory." width="760px" height="430px" variant="technical" >}}

### Designing the NVMe Layout

The three NVMe devices have intentionally different jobs:

| Device | Role | Why it exists |
|---|---|---|
| 2 TB NVMe | ESXi installation and remaining local datastore | Provides the physical host foundation and local capacity |
| 1 TB NVMe | Dedicated ESXi NVMe Memory Tier | Increases usable memory capacity for nested workloads |
| 4 TB Samsung 990 PRO | `nested-vcf` VMFS datastore | Holds vCenter, VIS, and the future nested VCF infrastructure |

The separation is more important than the raw capacity. I did not turn the 1 TB device into another datastore because storage was not the hardest constraint in this design. Memory was. Dedicating that entire device to Memory Tiering trades conventional storage capacity for a resource that is much harder to add to a compact system.

The 4 TB Samsung 990 PRO gives the nested environment a large, fast backing datastore. The 2 TB device keeps the physical ESXi installation and remaining local storage separate from both of those jobs.

The Host Client reported the three devices as 931.51 GiB, 1.82 TiB, and 3.64 TiB. Those binary-capacity values are the expected UI representation of the marketed 1 TB, 2 TB, and 4 TB drives.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/06-esxi-three-nvme-devices.jpeg" alt="ESXi Host Client storage device list showing Samsung 990 PRO drives with 931.51 GiB, 1.82 TiB, and 3.64 TiB capacities" caption="All three Samsung 990 PRO devices were attached and visible to ESXi with the expected capacities." width="760px" height="145px" fit="cover" position="center 49%" variant="technical" >}}

```text
MINISFORUM MS-A2
|
+-- AMD Ryzen 9 9955HX
|   +-- 16 physical cores
|   +-- 32 logical processors
|
+-- 128 GB DDR5 DRAM
|
+-- 2 TB NVMe
|   +-- ESXi 9.1 system
|   +-- Remaining local datastore
|
+-- 1 TB NVMe
|   +-- NVMe Memory Tier
|
+-- 4 TB Samsung 990 PRO
    +-- nested-vcf datastore
```

I created the second VMFS 6 datastore on the 4 TB device and named it `nested-vcf`. The completed view showed `datastore1` at 1.69 TB and `nested-vcf` at 3.64 TB, both essentially empty before the appliance deployments began.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/08-nested-vcf-datastore.png" alt="ESXi Host Client showing datastore1 at 1.69 TB and nested-vcf at 3.64 TB" caption="The final physical datastore layout: local `datastore1` on the 2 TB device and `nested-vcf` on the 4 TB device." width="800px" height="480px" variant="technical" >}}

## Configuring the Management Network

After ESXi was installed, I connected the MS-A2 directly to the MikroTik router and configured the physical host management interface. At this stage I wanted the router in the path because it was providing the `192.168.88.0/24` Layer 3 boundary, gateway, DHCP during initial discovery, and DNS service. The CRS309 switch will matter as the 10 Gb Layer 2 fabric expands, but it was not required to bring up the first management connection.

| Setting | Value |
|---|---|
| Hostname | `esxi01.lab.devynharrington.com` |
| Management IP | `192.168.88.10` |
| Network | `192.168.88.0/24` |
| Default gateway | `192.168.88.1` |
| DNS server | `192.168.88.1` |
| DNS domain | `lab.devynharrington.com` |

Getting DNS right at this stage was a prerequisite, not cleanup work. VCF relies heavily on forward and reverse name resolution, FQDNs, certificates, authentication, and consistent infrastructure services. Building appliances first and attempting to bolt DNS on afterward would create avoidable ambiguity during every later deployment and validation workflow.

The host initially received `192.168.88.254` from DHCP and identified itself as `esxi01`. I then moved the management interface to its planned static address, set the MikroTik router as gateway and DNS, and used the complete host identity `esxi01.lab.devynharrington.com`. I also added a static A record on the MikroTik DNS service and validated it explicitly against `192.168.88.1` before deploying vCenter.

```shell
nslookup esxi01.lab.devynharrington.com 192.168.88.1
```

{{< lab-product-image src="/images/vcf/ms-a2-day-1/09-mikrotik-esxi-dns-record.png" alt="MikroTik DNS static entry mapping esxi01.lab.devynharrington.com to 192.168.88.10" caption="The static MikroTik A record gave the physical host its planned FQDN and management address." width="760px" height="430px" variant="technical" >}}

{{< lab-product-image src="/images/vcf/ms-a2-day-1/10-esxi-dns-resolution.png" alt="ESXi shell nslookup result resolving esxi01.lab.devynharrington.com to 192.168.88.10 through 192.168.88.1" caption="Forward resolution succeeded from the ESXi shell before any management appliances were deployed." width="680px" height="330px" variant="technical" >}}

## Configuring 1:4 NVMe Memory Tiering

This was the architectural centerpiece of the day. The MS-A2 contains 128 GB of physical DRAM, and I dedicated the 1 TB NVMe device to ESXi NVMe Memory Tiering with a 1:4 DRAM-to-NVMe ratio, or a 400 percent NVMe tier relative to DRAM. Broadcom's [VCF Advanced Memory Tiering resource hub](https://blogs.vmware.com/cloud-foundation/vcf-advanced-memory-tiering/) provides the broader design material, while its [VCF 9.1 configuration walkthrough](https://blogs.vmware.com/cloud-foundation/2026/05/19/more-memory-less-effort-configuring-memory-tiering-in-vcf-9-1/) explains the DRAM Tier 0, NVMe Tier 1, dedicated-device requirement, and percentage-based configuration model.

I used the ESXi 9.1 `memtier` namespace rather than the older multi-command workflow. After positively matching the 931.51 GiB Samsung device and its complete `t10.NVMe...` identifier, I put the host into maintenance mode and initially enabled the tier at 200 percent:

```shell
esxcli system maintenanceMode set --enable true
esxcli memtier enable -d /vmfs/devices/disks/<1TB-NVME-DEVICE-ID> -r 200
```

That first pass exposed approximately 377 GiB in the Host Client, which matched 125.7 GiB of physical memory plus a roughly 251 GiB tier. After confirming that the correct device had been claimed, I changed the tier to the intended 400 percent configuration:

{{< lab-product-image src="/images/vcf/ms-a2-day-1/memory-tiering-200-percent-capacity.png" alt="ESXi Host Client Capacity and Usage panel showing 377.007 GB of memory capacity after configuring NVMe Memory Tiering at 200 percent" caption="At the initial 1:2 ratio, the Host Client reported 377.007 GB of total memory capacity, with 2.9 GB in use and 374.106 GB free." width="640px" height="415px" variant="technical" >}}

```shell
esxcli memtier config set --tier-size-pct 400
esxcli memtier status get
/sbin/auto-backup.sh
esxcli system maintenanceMode set --enable false
```

The final status reported the tier enabled on the 1 TB Samsung 990 PRO with **502.67 GiB**, or **400 percent of DRAM**, and licensing for four times DRAM. Running `/sbin/auto-backup.sh` persisted the host configuration before I exited maintenance mode.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/memory-tiering-400-percent-capacity.png" alt="ESXi Host Client Capacity and Usage panel showing 628.343 GB of memory capacity after configuring NVMe Memory Tiering at 400 percent" caption="After increasing the ratio to 1:4, the Host Client reported 628.343 GB of total memory capacity, with 2.927 GB in use and 625.417 GB free." width="640px" height="415px" variant="technical" >}}

The Host Client comparison made the effect visible immediately: increasing the NVMe tier from 200 to 400 percent raised the reported memory capacity from **377.007 GB** to **628.343 GB**, an increase of approximately **251.336 GB**. The small change in memory usage between the screenshots reflects normal host activity rather than additional tier capacity being consumed.

Conceptually, that gives the host:

```text
128 GB physical DRAM
+ approximately 512 GB NVMe-backed memory tier
= approximately 640 GB tiered addressable capacity
```

The exact capacity exposed by the host is affected by ESXi overhead and implementation details, so 640 GB is the useful design-level number rather than a promise that every byte appears to workloads.

More importantly, this does not turn the MS-A2 into a server with 640 GB of physical DRAM. DRAM remains the fast tier. NVMe is the larger and slower secondary tier. ESXi manages the resulting tiered pool, but an SSD does not acquire DRAM latency or bandwidth simply because it is participating in Memory Tiering.

{{< alert icon="circle-info" >}}
**NOTE:** NVMe-backed tiered memory is not equivalent to DRAM. Capacity increases dramatically, but the active workload still benefits from fitting its hot working set in the physical DRAM tier.
{{< /alert >}}

Why sacrifice a complete 1 TB SSD? In this lab, storage is relatively easy to add. Memory capacity is the more stubborn limit, particularly when multiple nested ESXi hosts have to coexist with vCenter and the rest of the VCF management stack. One NVMe device for the memory tier and a separate 4 TB NVMe for virtual-machine storage gives the host a much more useful balance for that workload.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/07-memory-tiering-400-percent.png" alt="ESXi shell showing NVMe Memory Tiering enabled on the 1 TB Samsung 990 PRO with 502.67 GiB at 400 percent of DRAM" caption="The final status showed the dedicated 1 TB device contributing a 502.67 GiB tier at 400 percent of DRAM. The configuration was then persisted with `auto-backup.sh`." width="760px" height="560px" variant="technical" >}}

## Deploying vCenter Server 9.1

With the host, network, storage, and memory foundation established, I deployed the VMware vCenter Server Appliance directly to the standalone physical ESXi host at `192.168.88.10`.

I mounted the 12.86 GB VCSA ISO on my Mac and launched the vCenter 9.1 installer. macOS initially prompted for Rosetta, then reported that the installer could not be opened from the mounted image. After working through that local launch issue and reopening the correct installer, the native deployment wizard loaded. That detour did not affect vCenter itself, but it was a reminder that the workstation-side installer has its own prerequisites before the appliance deployment begins.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/11-vcenter-installer.png" alt="VMware vCenter 9.1 Installer showing Install, Upgrade, and Restore options" caption="Once the local macOS launch issue was cleared, the vCenter 9.1 deployment wizard opened normally." width="760px" height="450px" variant="technical" >}}

The VCSA deployment used these values:

| Setting | Value |
|---|---|
| VM name | `vc01` |
| FQDN | `vc01.lab.devynharrington.com` |
| IP address | `192.168.88.20/24` |
| Gateway | `192.168.88.1` |
| DNS | `192.168.88.1` |
| Deployment size | Tiny |
| Datastore | `nested-vcf` |
| Disk provisioning | Thin |

The Tiny deployment size fits the role of this physical management layer. This vCenter is managing one physical cluster whose purpose is to host the nested lab. It does not need to be sized like a production vCenter responsible for a large estate.

The installer showed that the Tiny profile required 2 vCPUs, 14 GB of memory, and 619 GB of default storage, with support for up to 10 hosts and 100 VMs. Those are the installer's profile limits, not a sizing statement about the nested VCF workloads I plan to run.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/12-vcenter-tiny-size.png" alt="vCenter 9.1 installer with the Tiny deployment size selected" caption="Tiny was appropriate for the small physical management layer and still left room for the planned single-host inventory." width="760px" height="510px" variant="technical" >}}

The VCSA installer uses two stages. In Stage 1, I targeted the standalone ESXi host, selected the Tiny appliance size, placed the VM on `nested-vcf`, enabled thin provisioning, and configured its static network identity as `vc01.lab.devynharrington.com` at `192.168.88.20`.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/13-vcenter-select-nested-vcf.png" alt="vCenter installer datastore selection with nested-vcf selected and thin provisioning supported" caption="I selected the 3.64 TB `nested-vcf` datastore and enabled thin disk mode for the appliance." width="760px" height="510px" variant="technical" >}}

{{< lab-product-image src="/images/vcf/ms-a2-day-1/14-vcenter-network-settings.png" alt="vCenter installer network settings showing vc01.lab.devynharrington.com at 192.168.88.20 with gateway and DNS 192.168.88.1" caption="The VCSA received its final FQDN and static management address during Stage 1." width="760px" height="510px" variant="technical" >}}

The first attempt to validate the physical host target caught an operational mistake left over from Memory Tiering: the host was still in maintenance mode. The installer explicitly asked me to verify that `esxi01.lab.devynharrington.com` was not in maintenance mode. Once I exited maintenance mode, Stage 1 proceeded and deployed `vc01` successfully.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/vcenter-target-maintenance-mode-warning.png" alt="vCenter Server installer warning to verify that esxi01.lab.devynharrington.com is not in maintenance mode" caption="The Stage 1 target validation stopped here because the physical ESXi host was still in maintenance mode after the Memory Tiering work." width="760px" height="380px" variant="technical" >}}

{{< lab-product-image src="/images/vcf/ms-a2-day-1/15-vcenter-stage-1-complete.png" alt="vCenter installer reporting that Stage 1 successfully deployed vc01" caption="Stage 1 completed the appliance deployment and exposed the VAMI URL for continuing with setup." width="760px" height="470px" variant="technical" >}}

Stage 2 configured the appliance itself. I initially selected NTP synchronization with `time.cloudflare.com`, enabled SSH, created the `vsphere.local` SSO domain, and used `administrator@vsphere.local` as the SSO administrator. Passwords are intentionally omitted.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/16-vcenter-stage-2-ntp.png" alt="vCenter Stage 2 configuration with NTP synchronization selected, time.cloudflare.com entered, and SSH activated" caption="Stage 2 initially used `time.cloudflare.com` and enabled SSH. I later standardized both vCenter and ESXi on `time.google.com`." width="760px" height="470px" variant="technical" >}}

Stage 2 then started the authentication and vSphere services. The process completed successfully and returned the final `https://vc01.lab.devynharrington.com:443` link.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/17-vcenter-stage-2-complete.png" alt="vCenter installer reporting Stage 2 complete" caption="Stage 2 completed successfully and the vSphere Client was ready for its first login." width="760px" height="470px" variant="technical" >}}

When Stage 2 completed, I logged into the new vSphere Client. The UI reported vCenter **9.1**, release **9.1.0.0300**, build **25629530**. Those are the versions installed during this build, not a claim that they are the latest builds available at the time someone reads this.

The VCSA is a VM running on the physical ESXi host, with its virtual disks on the `nested-vcf` datastore backed by the 4 TB Samsung 990 PRO.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/18-vcenter-9-1-summary.png" alt="vCenter 9.1 summary showing release 9.1.0.0300 and build 25629530 before inventory was created" caption="The new vCenter came online at release 9.1.0.0300, build 25629530, with an empty inventory ready to build." width="800px" height="560px" variant="technical" >}}

## Building the Initial vSphere Inventory

Inside vCenter, I created the `Lab-Datacenter` container first. My initial attempt to create `Lab-Cluster` exposed a sequencing detail in the vCenter 9.1 image workflow: the new cluster wizard's image list only offered ESXi 8.0 U3e images because vCenter had not yet learned the software specification of my ESXi 9.1 host.

Rather than assign the wrong image, I stopped that cluster workflow and added `esxi01.lab.devynharrington.com` directly beneath `Lab-Datacenter`. During the Add Host wizard, I selected the option to extract the image from the host. vCenter read **ESXi 9.1.0.0200.25557999**, added that specification to the Image Library as `autogen-software-spec-1`, and associated it with the host.

With the ESXi 9.1 specification now available, I created `Lab-Cluster`, selected `autogen-software-spec-1`, moved the host into the cluster, and skipped Cluster Quickstart because I wanted to configure this unusual single-node physical foundation manually.

The resulting inventory was:

```text
vc01.lab.devynharrington.com
+-- Lab-Datacenter
    +-- Lab-Cluster
        +-- esxi01.lab.devynharrington.com
            +-- vc01
```

I did not enable vSphere HA, vSphere DRS, vSAN, or vSAN ESA. Those services have meaningful roles in multi-host clusters, but this physical cluster currently contains one host. Here, `Lab-Cluster` is primarily an organizational and lifecycle-management construct for the physical platform that will run the nested environment. Enabling services that cannot deliver their normal multi-host value would add configuration without adding capability.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/19-cluster-autogen-image.png" alt="vCenter New Cluster wizard showing autogen-software-spec-1 with ESXi 9.1.0.0200.25557999" caption="Adding the ESXi 9.1 host first populated the Image Library with the correct automatically generated software specification." width="760px" height="470px" variant="technical" >}}

{{< lab-product-image src="/images/vcf/ms-a2-day-1/20-final-vcenter-inventory.png" alt="vCenter inventory showing Lab-Datacenter, Lab-Cluster, esxi01, and vc01 with a time synchronization warning" caption="The final inventory hierarchy was in place. The remaining warning led directly into the NTP troubleshooting session." width="800px" height="470px" variant="technical" >}}

### Adding the Physical Host and Its Lifecycle Image

The host connected successfully and reported the expected MS-A2 model, AMD Ryzen 9 9955HX processor, 32 logical processors, and three NICs. Because vCenter itself runs on this host, the `vc01` VM appeared beneath it as soon as the host joined inventory.

The vCenter 9.1 workflow also made image-based lifecycle management prominent while the host was being added. The host was already running ESXi 9.1, and the workflow showed the host image as **ESXi 9.1.0.0200.25557999**. vCenter created the automatically generated software specification `autogen-software-spec-1`, which then made it possible to associate the new cluster with the correct ESXi image.

That is worth calling out for anyone accustomed to older vSphere workflows. Cluster image management is much more visible in the current experience. I established the image relationship but did not configure functionality beyond what I actually needed for this single-host cluster.

## Troubleshooting NTP Instead of Ignoring It

The first real troubleshooting session came from time synchronization. I initially configured both ESXi and vCenter to use `time.cloudflare.com`. The ESXi UI said the NTP service was running, but the vSphere Time Synchronization Services test reported **Configuration is not working normally**.

The detailed test was more useful than the service status. It confirmed that NTP was enabled, the hostname resolved over IPv4, `vmk0` was up, a default route existed, UDP 123 was allowed, `ntpd` was running, and the kernel clock type was NTP. It also reported the two lines that mattered:

```text
NTP is not synced
NTP never was synchronized
```

{{< alert icon="triangle-exclamation" >}}
**LESSON LEARNED:** A running NTP daemon does not mean the host is synchronized. Validate the peer state and the host's actual synchronization status.
{{< /alert >}}

{{< lab-product-image src="/images/vcf/ms-a2-day-1/21-ntp-test-failure.png" alt="vSphere Time Synchronization Services test reporting that NTP is not synced and was never synchronized" caption="The service test confirmed that networking, DNS, the firewall rule, and `ntpd` were present, but the host had never synchronized." width="760px" height="520px" variant="technical" >}}

I connected to the ESXi host over SSH and checked the peer state and configured server:

```shell
ntpq -p
esxcli system ntp get
```

The Cloudflare source appeared in an INIT, non-synchronized state. I then validated basic connectivity and routing:

{{< lab-product-image src="/images/vcf/ms-a2-day-1/22-ntp-cloudflare-init.png" alt="ESXi shell showing time.cloudflare.com in INIT state and Time Synchronized false" caption="`ntpq -p` exposed the difference between a running daemon and a synchronized clock: the Cloudflare peer remained in INIT." width="700px" height="350px" variant="technical" >}}

```shell
vmkping 162.159.200.1
esxcli network ip route ipv4 list
```

The host could ping the resolved Cloudflare address at `162.159.200.1`, and its default route correctly pointed through `192.168.88.1`. Basic IP reachability was not the problem.

I could have spent the rest of the evening investigating the behavior of that NTP source from this host. Instead, I changed ESXi to `time.google.com` and kept moving:

```shell
esxcli system ntp set -s time.google.com -e 1
/etc/init.d/ntpd restart
esxcli system ntp get
ntpq -p
```

The Google peer appeared before it had synchronized, which is normal. After a short wait, `ntpq -p` showed that peer selected with an asterisk. A final check provided the success condition I was looking for:

```shell
esxcli system ntp get
```

The output reported:

```text
Time Synchronized: true
```

{{< lab-product-image src="/images/vcf/ms-a2-day-1/24-ntp-google-synchronized.png" alt="ESXi shell showing time3.google.com selected with an asterisk and Time Synchronized true" caption="After the peer had time to settle, Google NTP was selected and ESXi reported `Time Synchronized: true`." width="700px" height="350px" variant="technical" >}}

### Standardizing vCenter on the Same Time Source

Once ESXi was synchronized, I updated vCenter to use [`time.google.com`](https://developers.google.com/time) as well. I made that change in the vCenter Server Management Interface, or VAMI, rather than in the normal vSphere inventory view.

VAMI showed the synchronization mode as NTP, the server as `time.google.com`, and a healthy status. The appliance timezone remained `Etc/UTC`, which is expected.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/25-vcenter-vami-google-ntp.png" alt="vCenter VAMI showing NTP mode, time.google.com with a healthy indicator, and Etc UTC timezone" caption="The vCenter VAMI confirmed the final shared time source and healthy status. `Etc/UTC` remained the expected appliance timezone." width="760px" height="330px" variant="technical" >}}

Stopping to fix this warning was not cosmetic. VCF components depend on consistent time for authentication, SSO, certificates, tokens, log correlation, API calls, lifecycle operations, and distributed infrastructure services. Time drift can turn a later deployment failure into an unnecessarily difficult troubleshooting exercise.

## Introducing the VCF Infrastructure Services Appliance

The final major task was deploying William Lam's [VCF Infrastructure Services Appliance](https://lamw.github.io/vcf-infrastructure-service-appliance/), which I refer to here as VIS. William's [VIS lab and proof-of-concept introduction](https://williamlam.com/2026/07/vcf-infrastructure-services-vis-appliance-for-vcf-9-1-lab-poc.html) explains the problem the appliance is designed to solve. The project's [deployment documentation](https://lamw.github.io/vcf-infrastructure-service-appliance/deploy.html) covers the appliance workflow, and its binaries are published through [GitHub releases](https://github.com/lamw/vcf-infrastructure-service-appliance/releases).

VIS provides a compact set of infrastructure services suited to VCF labs and proof-of-concept environments. It is William Lam's project, not an official production VCF component from Broadcom. For my nested lab, it offers a useful way to assemble the supporting services needed for the next phase without scattering them across a collection of unrelated utility VMs.

### Downloading and Verifying VIS 1.0.3

I deployed VIS version **1.0.3**. Because of GitHub asset size limits, its OVA was distributed as split release files:

```text
vcf-infrastructure-services-appliance-1.0.3.ova.part-aa
vcf-infrastructure-services-appliance-1.0.3.ova.part-ab
vcf-infrastructure-services-appliance-1.0.3.ova.part-ac
vcf-infrastructure-services-appliance-1.0.3.ova.sha256
vcf-infrastructure-services-appliance-1.0.3.ova.parts.sha256
```

I verified every downloaded part before reconstructing the OVA:

```shell
shasum -a 256 -c vcf-infrastructure-services-appliance-1.0.3.ova.parts.sha256
```

I then joined the split files and verified the completed artifact:

```shell
cat vcf-infrastructure-services-appliance-1.0.3.ova.part-* > vcf-infrastructure-services-appliance-1.0.3.ova
shasum -a 256 -c vcf-infrastructure-services-appliance-1.0.3.ova.sha256
```

{{< alert icon="shield" >}}
**SECURITY AND INTEGRITY:** I checksum-verified both the split downloads and the reconstructed OVA. This validates the artifact and avoids wasting deployment time on a corrupted multipart download.
{{< /alert >}}

## Deploying VIS01

I deployed the reconstructed OVA through vCenter with the following configuration:

| Setting | Value |
|---|---|
| VM name | `VIS01` |
| FQDN | `vis01.lab.devynharrington.com` |
| IPv4 address | `192.168.88.30/24` |
| Gateway | `192.168.88.1` |
| DNS | `192.168.88.1` |
| NTP | `time.google.com` |
| Datastore | `nested-vcf` |
| Disk provisioning | Thin |
| Container pod CIDR | `10.10.0.0/16` |
| SSH public key | Left blank for the initial deployment |
| Debugging | Disabled |

I kept the `10.10.0.0/16` pod network separate from the `192.168.88.0/24` physical management network and from the ranges planned for nested VCF. Overlapping service, container, management, or workload networks are the sort of design error that can remain hidden until routing becomes much harder to change.

I configured the required appliance and application account passwords during deployment, but those values do not belong in a public build log.

### First Boot and Login

VIS powered on successfully. vCenter reported Ubuntu Linux (64-bit), VMware Tools running, the DNS name `vis01.lab.devynharrington.com`, and IPv4 address `192.168.88.30`. An IPv6 link-local address was also present, which was normal and did not indicate a problem.

After verifying DNS resolution, I opened `http://vis01.lab.devynharrington.com`. This address resolves only inside my private lab, so I am showing it as a configuration value rather than publishing it as a clickable link. The VIS Management Console sign-in page loaded successfully over HTTP.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/vis01-management-console-login.png" alt="VCF Infrastructure Services Appliance Management Console sign-in page for VIS01" caption="The VIS Management Console loaded successfully through the appliance FQDN, confirming that DNS, HTTP, and the web application were reachable inside the private lab." width="760px" height="525px" variant="technical" >}}

I logged in with the application administrator account created during the OVA deployment. The Service Summary loaded with a healthy **Ready to Configure** state, SQLite as the persistent state store, and **0 of 9** services enabled. That was the expected starting point: the appliance was operational, while Software Depot, SFTP Backup, Container Registry, LDAP, OIDC, DNS, NTP, DHCP, and Key Management still needed to be configured for the lab.

{{< lab-product-image src="/images/vcf/ms-a2-day-1/vis01-service-summary.png" alt="VIS01 Service Summary showing Ready to Configure status, SQLite state store, and zero of nine infrastructure services enabled" caption="The first authenticated view of VIS01 showed a healthy appliance ready for configuration. None of the nine optional infrastructure services had been enabled yet." width="760px" height="525px" variant="technical" >}}

## Where the Lab Stands Now

The end-of-day management architecture is deliberately small. The MikroTik infrastructure supplies the gateway and DNS services for the physical management network. One physical ESXi host runs both infrastructure VMs from the `nested-vcf` datastore.

{{< mermaid >}}
flowchart TB
    HOME[Home / Lab Network] --> MT[MikroTik Infrastructure<br/>Gateway and DNS: 192.168.88.1]
    MT --> NET[Management Network<br/>192.168.88.0/24]
    NET --> ESX[Physical ESXi 9.1<br/>esxi01.lab.devynharrington.com<br/>192.168.88.10]
    ESX --> VC[vc01<br/>vCenter Server 9.1<br/>192.168.88.20]
    ESX --> VIS[VIS01<br/>VCF Infrastructure Services<br/>192.168.88.30]
    STORE[4 TB Samsung 990 PRO<br/>nested-vcf datastore] -. backs .-> VC
    STORE -. backs .-> VIS
{{< /mermaid >}}

The current address plan is:

| Component | FQDN | IP / CIDR | Purpose |
|---|---|---|---|
| Physical ESXi | `esxi01.lab.devynharrington.com` | `192.168.88.10` | Physical hypervisor |
| vCenter | `vc01.lab.devynharrington.com` | `192.168.88.20` | vSphere management |
| VIS | `vis01.lab.devynharrington.com` | `192.168.88.30` | VCF lab infrastructure services |
| Gateway / DNS | N/A | `192.168.88.1` | MikroTik infrastructure |
| VIS pod network | N/A | `10.10.0.0/16` | VIS container networking |

The memory and storage architecture now looks like this:

```text
128 GB physical DRAM
        |
        + 1:4 NVMe tier on dedicated 1 TB NVMe
        |
        +--> approximately 640 GB theoretical tiered capacity
             before overhead and implementation details

2 TB NVMe
+-- ESXi 9.1
+-- Remaining local storage

4 TB Samsung 990 PRO
+-- nested-vcf datastore
    +-- vc01
    +-- VIS01
    +-- Future nested VCF infrastructure
```

By the end of the session, I had completed and validated the following:

- Personal-use licensing and ESXi download access were available.
- ESXi 9.1 was installed on the physical MS-A2.
- Management networking and DNS were working.
- The three NVMe devices had distinct system, memory-tier, and nested-storage roles.
- NVMe Memory Tiering was configured at 1:4.
- The 4 TB Samsung 990 PRO was formatted as the `nested-vcf` datastore.
- vCenter Server 9.1 was deployed as `vc01`.
- `Lab-Datacenter` and `Lab-Cluster` were created.
- The physical host was added and associated with its lifecycle image.
- NTP was troubleshot instead of trusting service status alone.
- ESXi and vCenter were synchronized to `time.google.com`.
- VIS 1.0.3 downloads and the reconstructed OVA passed checksum validation.
- `VIS01` deployed successfully at `192.168.88.30`.
- DNS resolution, VMware Tools, the VIS interface, and application login all worked.

The physical foundation is ready. The nested VCF 9.1 environment is not deployed yet.

## Sources and References

- [VMUG Advantage Home Lab License Guide](https://blogs.vmware.com/code/2025/03/19/vmug-advantage-home-lab-license-guide/)
- [Rufus official website and downloads](https://rufus.ie/)
- [VMware Cloud Foundation on the MINISFORUM MS-A2 — William Lam](https://williamlam.com/2025/06/vmware-cloud-foundation-vcf-on-minisforum-ms-a2.html)
- [VCF Advanced Memory Tiering resource hub — Broadcom](https://blogs.vmware.com/cloud-foundation/vcf-advanced-memory-tiering/)
- [Configuring Memory Tiering in VCF 9.1 — Broadcom](https://blogs.vmware.com/cloud-foundation/2026/05/19/more-memory-less-effort-configuring-memory-tiering-in-vcf-9-1/)
- [Google Public NTP](https://developers.google.com/time)
- [VCF Infrastructure Services Appliance project documentation](https://lamw.github.io/vcf-infrastructure-service-appliance/)
- [VIS deployment documentation](https://lamw.github.io/vcf-infrastructure-service-appliance/deploy.html)
- [VIS 1.0.3 release downloads and checksums](https://github.com/lamw/vcf-infrastructure-service-appliance/releases)
- [VCF Infrastructure Services Appliance for VCF 9.1 Lab/PoC — William Lam](https://williamlam.com/2026/07/vcf-infrastructure-services-vis-appliance-for-vcf-9-1-lab-poc.html)

## What Comes Next

The next build session will start inside VIS and prepare the services required by the nested VCF deployment. That work is likely to include VIS service configuration, DNS and NTP for the nested environment, software depot functionality, detailed network planning, nested ESXi sizing, compute and memory allocation, deployment of the nested hosts, and preparation of the VCF management networks.

Only after those dependencies are ready will I move into deploying VCF itself. From there, the lab can expand into VKS, Automation, Operations, networking, lifecycle testing, and the other services that motivated the build in the first place.

The day began with finally getting access to the ESXi download and ended with a physical ESXi 9.1 host, vCenter 9.1, verified DNS and NTP, roughly 640 GB of theoretical tiered memory capacity, and VIS online. The actual VCF deployment is still ahead, but the foundation is no longer a diagram. It is running.

This third entry also closes the loop on the immediate next steps from the 128 GB article. ESXi is installed, the host recognizes the platform resources, the three NVMe devices have their intended roles, Memory Tiering is active, the management network is functioning, and the first nested-VCF support appliances are online. The next article can begin from a working foundation instead of another hardware prerequisite.
