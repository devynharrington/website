+++
title = "My Nested VCF 9.1 Home Lab Plan"
date = "2026-08-08"
draft = false
slug = "building-a-single-node-nested-vmware-cloud-foundation-9-1-home-lab"
aliases = ["/vcf/building-a-single-node-nested-vmware-cloud-foundation-9-1-home-lab/"]
description = "Designing a compact nested VMware Cloud Foundation 9.1 home lab around one MINISFORUM MS-A2, 128 GB of DDR5, NVMe Memory Tiering, nested ESX, and an isolated 10 Gb network."
images = ["/images/vcf/vcf-9-1-home-lab/minisforum-ms-a2-9955hx-specifications.jpg"]
keywords = ["VMware Cloud Foundation 9.1 homelab", "VCF 9.1 home lab", "VCF 9.1 nested lab", "MINISFORUM MS-A2 VMware", "MS-A2 ESX 9.1", "VCF NVMe Memory Tiering", "Nested ESX 9.1", "Nested VCF", "VMware homelab", "MikroTik VMware homelab"]
tags = ["VCF", "VMware Cloud Foundation", "Home Lab", "Nested ESX", "NVMe Memory Tiering", "MINISFORUM MS-A2", "MikroTik", "VKS", "VCF Automation"]
categories = ["Home Lab"]

showDate = true
showReadingTime = true
showWordCount = false
showTableOfContents = true
+++

I have always wanted a home lab that I could own, rebuild, and break without depending on a customer environment or shared corporate lab. I just could not justify pulling the trigger on an expense like this. Anyone with kids knows how quickly the home front competes with the home lab, and I have three of them.

## Why Now?

This time, the timing felt right. I had just been selected as a Broadcom VCF Knight, was promoted to Practice Manager and VCF Architect, and will continue supporting my Navy engagement in a new capacity as an architect. With VMware Explore only weeks away, the stars finally aligned, so I ordered the hardware today.

The timing also solved the software side of the lab. As a Knight, I was able to have the [**$210 annual VMUG Advantage membership**](https://vmug.com/memberships) covered. Maintaining that membership alongside my VCP-VCF certification gives me access to a [**personal-use VCF license for up to 128 cores**](https://blogs.vmware.com/code/2025/03/19/vmug-advantage-home-lab-license-guide/), with annual renewal requirements for up to three years. Those licenses are strictly for personal learning and experimentation, which is exactly what this lab is for.

That is another practical benefit of becoming a Broadcom Knight. Preparing for the VCAP and VCF 9 certifications, taking instructor-led Broadcom courses, and testing what I learned improved how I support my customers and what I can share with my team. The exclusive events are nice, but the bigger return is better architecture and delivery. This lab will now give me a place to turn that work into useful field notes and an opportunity to better contribute to the community.

That community work also gave me material for the [**vExpert**](https://vexpert.vmware.com/) application I recently submitted. The program recognizes contributions such as technical articles, presentations, podcasts, code, and helping other practitioners. Its 2026 second-half application window closes **August 13**, so apply if you have work to share. [**Corey Romero covers the deadline here**](https://www.youtube.com/watch?v=TBZisx5XLyU&t=349s), followed by details about the vExpert gifts available at VMware Explore. The same VMware Communities Roundtable episode later brings in [**Dale Hassinger**](https://www.vcrocs.info/) to discuss the Explore Hackathon and how community participation can create new opportunities.

## The Plan: One Physical Host, Several Nested Hosts

The goal is a compact VCF 9.1 environment for learning and testing Operations, Automation, NSX, Supervisor, VKS, workload domains, lifecycle workflows, and APIs. This article covers the plan, purchases, and reasoning. I will document the deployment and results after the hardware arrives.

I am starting with one powerful physical ESX 9.1 host rather than buying a full three-node cluster immediately. Nested ESX VMs will provide the topology VCF needs, while NVMe Memory Tiering should help stretch the host's 128 GB of DRAM. The lab will be isolated from my home network and connected through 10 Gb SFP+.

I would have loved to start with three or four physical nodes, but memory pricing changed the math. William Lam's [July 2025 VCF hardware BOM](https://williamlam.com/2025/07/vcf-9-0-hardware-bom-for-silicon-valley-vmug.html) listed this Crucial 128 GB kit at $279.99. I paid $1,659.99 for it, an increase of $1,380, or about 493 percent. The complete one-node build is already $4,807.52. Around that same budget could have funded a small multi-node lab at last year's component prices.

Rather than break the bank trying to build the entire cluster now, I am getting one nested node running first. The router, 10 Gb switch, cabling, rack, and power design already leave room for at least two more MS-A2 nodes when I feel like dropping that much money on more sticks of RAM.

{{< vcf-lab-architecture >}}

Nested virtualization is ideal for functional learning, but it cannot demonstrate production availability, performance, or sizing. I chose the router, switch, rack, and UPS with an eventual three-node physical lab in mind so those parts will not need replacing when I add more compute.

## Why the MINISFORUM MS-A2?

The foundation is a barebones [MINISFORUM MS-A2 with an AMD Ryzen 9 9955HX](https://www.amazon.com/dp/B0G1MRPY2Z). The processor has 16 physical cores and 32 hardware threads, which ESX sees as 32 logical processors. That is enough to power on the 24-vCPU VCF Automation appliance, but those vCPUs are scheduled across the same 16 physical cores used by the rest of the lab. The additional threads improve scheduling flexibility, but they do not double physical CPU performance. This is suitable for functional testing, not production sizing or performance comparisons. Three storage-device options and built-in 10 Gb SFP+ connectivity add a lot of lab capacity in a small chassis. [William Lam's MS-A2 VCF testing](https://williamlam.com/2025/06/vmware-cloud-foundation-vcf-on-minisforum-ms-a2.html) helped confirm that the platform was a sensible starting point.

<div class="lab-product-gallery" style="display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:.85rem;margin:1.5rem 0">
{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/minisforum-ms-a2-chassis.jpg" alt="MINISFORUM MS-A2 compact workstation shown horizontally and vertically with its connectivity visible" caption="MINISFORUM MS-A2 compact workstation." >}}
{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/minisforum-ms-a2-9955hx-specifications.jpg" alt="AMD Ryzen 9 9955HX processor specifications showing 16 cores, 32 threads, 64 MB L3 cache, and up to 5.4 GHz" caption="Ryzen 9 9955HX specifications for the selected MS-A2." >}}
</div>

This is compact lab hardware, not Broadcom Compatibility Guide certified production equipment.

## Memory and NVMe Memory Tiering

VCF is memory hungry, so I bought a [Crucial 128 GB DDR5-5600 kit](https://www.amazon.com/dp/B0DSQMKYLN) with two 64 GB SODIMMs. It is the largest practical native-memory configuration for this build. MINISFORUM officially lists 96 GB as the supported maximum, so 128 GB remains outside the published specification.

[William Lam's MS-A2 overview](https://williamlam.com/2025/06/vmware-cloud-foundation-vcf-on-minisforum-ms-a2.html) points to community reports of 128 GB working and confirms in the comments that the shared MS-A2 bill of materials applies to both processor variants. That is encouraging, but it is not vendor validation of my exact 9955HX and Crucial combination. In one [community report using that combination](https://www.reddit.com/r/homelab/comments/1ps7lnu/minisforum_msa2_with_128_gb_of_ram_not_getting_to/), the system would not reach the BIOS until a smaller DIMM was used to set the memory speed to **4800 MT/s**, after which the 128 GB kit was reinstalled. I will first allow time for DDR5 memory training and update the BIOS. If it still does not POST, 4800 MT/s is the fallback I will test before running a full memory test and installing ESX.

{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/crucial-128gb-ddr5-sodimm-kit.jpg" alt="Two Crucial DDR5 SODIMM modules from the 128 GB memory kit" caption="Crucial 128 GB kit with two 64 GB DDR5-5600 SODIMMs." >}}

NVMe Memory Tiering gives ESX more usable **logical memory**, but it does not turn the SSD into DRAM. ESX keeps frequently accessed memory pages in fast DRAM and moves colder pages to the slower NVMe tier automatically. With 128 GB of DRAM and the default 1:1 ratio, the host would expose roughly 256 GB of logical memory: 128 GB from DRAM and 128 GB from NVMe. Higher supported ratios can contribute more of the SSD. A 1:2 ratio would provide about 384 GB total, while the maximum 1:4 ratio would provide about 640 GB total. The full 1 TB SSD is not automatically added as RAM; the configured ratio controls how much contributes to the pool. [Broadcom's VCF 9.1 overview](https://blogs.vmware.com/cloud-foundation/2026/05/07/advanced-memory-tiering-enhancements-in-vmware-cloud-foundation-9-1/) explains how hot and cold pages move between the two tiers, while its [sizing guidance](https://blogs.vmware.com/cloud-foundation/2025/12/02/nvme-memory-tiering-design-and-sizing-on-vmware-cloud-foundation-9-part-3/) recommends starting at 1:1 and ensuring the active working set still fits in DRAM. I plan to test several ratios because more capacity can also mean more traffic to slower NVMe.

## Why Three NVMe Drives?

Each drive has a specific job:

- **1 TB Samsung 990 PRO:** dedicated NVMe Memory Tiering device
- **2 TB Samsung 990 PRO:** physical ESX, ESX-OSData, and a local VMFS datastore for utility VMs, ISOs, and templates
- **4 TB Samsung 990 PRO:** primary capacity for the nested ESX virtual disks and VCF management and workload components

The 4 TB drive provides room for the VCF footprint and future workload-domain experiments. The nested hosts will share that capacity through virtual disks; they do not each receive 4 TB, and thin provisioning does not create additional physical space.

<div class="lab-product-gallery lab-product-gallery--three" style="display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:.85rem;margin:1.5rem 0">
{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/samsung-990-pro-1tb.jpg" alt="Samsung 990 PRO 1 TB NVMe SSD" caption="1 TB for NVMe Memory Tiering." >}}
{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/samsung-990-pro-2tb.jpg" alt="Samsung 990 PRO 2 TB NVMe SSD" caption="2 TB for physical ESX and utility workloads." >}}
{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/samsung-990-pro-4tb.jpg" alt="Samsung 990 PRO 4 TB NVMe SSD" caption="4 TB for nested VCF backing capacity." >}}
</div>

These are consumer NVMe drives, so endurance, temperature, and sustained I/O behavior are still items I will validate once the lab is running.

## Networking, Isolation, and Growth

The [MikroTik RB5009](https://www.amazon.com/dp/B09GW641SL) will provide the routed boundary between the lab and home network. The [CRS309](https://www.amazon.com/dp/B07QNJY2B5) provides eight 10 Gb SFP+ ports, and three [10Gtek passive DACs](https://www.amazon.com/dp/B00SM59Q14) leave room for two more MS-A2 nodes later.

<div class="lab-product-gallery lab-product-gallery--three" style="display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:.85rem;margin:1.5rem 0">
{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/mikrotik-rb5009-router.jpg" alt="MikroTik RB5009UG+S+IN router" caption="MikroTik RB5009 routed lab boundary." >}}
{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/mikrotik-crs309-switch.jpg" alt="MikroTik CRS309-1G-8S+IN 10 gigabit switch" caption="MikroTik CRS309 eight-port 10 Gb SFP+ core." >}}
{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/10gtek-sfp-dac-cable.jpg" alt="10Gtek passive SFP+ direct attach copper cable" caption="10Gtek one-meter passive SFP+ DAC." >}}
</div>

The final design will use dedicated VLANs and controlled routing for ESX management, vMotion, storage, NSX TEPs and uplinks, VCF services, VKS, and workloads. This [MikroTik configuration reference](https://williamlam.com/2025/07/initial-mikrotik-router-switch-configuration-for-vcf-9-0.html) is a useful foundation, particularly for Layer 2/3 separation and consistent MTU settings.

## Rack and Power

The [DeskPi RackMate T2](https://www.amazon.com/dp/B0DT2XM22G) keeps the small hardware organized without requiring a full 19-inch rack. A [CyberPower CP1500PFCLCD](https://www.amazon.com/dp/B00429N19W) provides 1500 VA/1000 W power protection and a cleaner shutdown path during an outage.

<div class="lab-product-gallery" style="display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:.85rem;margin:1.5rem 0">
{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/deskpi-rackmate-t2.jpg" alt="DeskPi RackMate T2 12U mini rack" caption="DeskPi RackMate T2 12U mini rack." >}}
{{< lab-product-image src="/images/vcf/vcf-9-1-home-lab/cyberpower-cp1500pfclcd-ups.jpg" alt="CyberPower CP1500PFCLCD uninterruptible power supply" caption="CyberPower CP1500PFCLCD 1500 VA UPS." >}}
</div>

## What I Bought

These are my August 2026 purchase prices. They identify the exact components, not necessarily today's lowest prices.

| Component | Model | Planned purpose | Qty | Price each | Total | Product reference |
|---|---|---|---:|---:|---:|---|
| Physical host | MINISFORUM MS-A2, Ryzen 9 9955HX | Physical ESX 9.1 and nested VCF compute | 1 | $799.90 | $799.90 | [Amazon](https://www.amazon.com/dp/B0G1MRPY2Z) |
| Memory | Crucial CT2K64G56C46S5, 2 x 64 GB DDR5-5600 SODIMMs | 128 GB of physical DDR5 DRAM | 1 | $1,659.99 | $1,659.99 | [Amazon](https://www.amazon.com/dp/B0DSQMKYLN) |
| NVMe | Samsung 990 PRO 1 TB | Dedicated Memory Tiering device | 1 | $239.99 | $239.99 | [Amazon](https://www.amazon.com/dp/B0BHJF2VRN) |
| NVMe | Samsung 990 PRO 2 TB | ESX, OS data, VMFS, and utility workloads | 1 | $389.99 | $389.99 | [Amazon](https://www.amazon.com/dp/B0BHJJ9Y77) |
| NVMe | Samsung 990 PRO 4 TB | Nested VCF backing capacity | 1 | $829.99 | $829.99 | [Amazon](https://www.amazon.com/dp/B0CHGT1KFJ) |
| Router | MikroTik RB5009UG+S+IN | Routed lab boundary and VLAN services | 1 | $186.44 | $186.44 | [Amazon](https://www.amazon.com/dp/B09GW641SL) |
| Switch | MikroTik CRS309-1G-8S+IN | Eight-port 10 Gb SFP+ core | 1 | $266.31 | $266.31 | [Amazon](https://www.amazon.com/dp/B07QNJY2B5) |
| Cabling | 10Gtek 1 m passive SFP+ DAC | 10 Gb host and uplink connectivity | 3 | $14.99 | $44.97 | [Amazon](https://www.amazon.com/dp/B00SM59Q14) |
| UPS | CyberPower CP1500PFCLCD | Power protection and controlled shutdown | 1 | $239.95 | $239.95 | [Amazon](https://www.amazon.com/dp/B00429N19W) |
| Rack | DeskPi RackMate T2, 12U | Compact physical organization and expansion | 1 | $149.99 | $149.99 | [Amazon](https://www.amazon.com/dp/B0DT2XM22G) |
|  |  | **Total purchased hardware** |  |  | **$4,807.52** |  |

## What I'll Validate Once the Hardware Arrives

Existing MS-A2 guidance gives me confidence that the 128 GB configuration, using two 64 GB Crucial DDR5-5600 SODIMMs, will work. Once the hardware arrives, I will document my results with the 9955HX, including memory detection, ESX 9.1 compatibility, NIC and NVMe detection, Memory Tiering, thermals, networking, and the practical limits of running nested VCF 9.1 on one physical node.

The results will show what this lab can support, not provide production sizing guidance. For now, the project has moved from an idea to a pile of tracking numbers, which feels like a pretty good start.
