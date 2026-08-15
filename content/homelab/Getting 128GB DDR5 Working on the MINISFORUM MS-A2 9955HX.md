+++
title = "Getting 128GB DDR5 Working on the MINISFORUM MS-A2 9955HX"
date = "2026-08-14"
draft = false
slug = "getting-128gb-ddr5-working-on-the-minisforum-ms-a2-9955hx"
description = "My Ryzen 9 9955HX MS-A2 would not POST with 2 x 64 GB of Crucial DDR5 at the default 5600 MT/s. Setting the memory target to 4800 MT/s got the full 128 GB working immediately."
images = ["/images/vcf/ms-a2-128gb/00-crucial-128gb-kit-packaging.png"]
featureimage = "images/vcf/ms-a2-128gb/00-crucial-128gb-kit-packaging.png"
hideFeatureImage = true
keywords = ["MINISFORUM MS-A2 128GB", "MS-A2 9955HX 128GB", "MS-A2 128GB RAM", "Ryzen 9 9955HX 128GB", "Crucial CT2K64G56C46S5 MS-A2", "MS-A2 memory 4800", "MS-A2 128GB not booting", "MS-A2 128GB POST", "VMware homelab MS-A2"]
tags = ["VCF", "VMware Cloud Foundation", "Home Lab", "MINISFORUM MS-A2", "DDR5", "Crucial", "Nested ESX", "NVMe Memory Tiering"]
categories = ["Home Lab"]

showDate = true
showReadingTime = true
showWordCount = false
showTableOfContents = true
+++

My first meaningful hardware hurdle in the [nested VCF 9.1 home lab I am building](/homelab/building-a-single-node-nested-vmware-cloud-foundation-9-1-home-lab/) was getting the full 128 GB of memory to work. I was assembling the barebones MINISFORUM MS-A2 with RAM and three Samsung 990 PRO NVMe drives when the system refused to reach the BIOS with both 64 GB DIMMs installed.

The fans spun and the machine stayed powered on, but there was no HDMI output. After troubleshooting the configuration, one BIOS change made the difference on my system: reducing **Memory Target Speed** from the default 5600 MT/s to **4800 MT/s** before reinstalling the second DIMM.

> On my Ryzen 9 9955HX MS-A2, the Crucial CT2K64G56C46S5 128 GB kit would not POST with both DIMMs installed at the default 5600 MT/s setting. Booting with one 64 GB DIMM, setting Memory Target Speed to 4800 MT/s, saving that configuration, and then reinstalling the second DIMM resulted in an immediate successful POST with the full 128 GB recognized.

I reproduced this on my own hardware on August 14, 2026. It is one result from a specific system and firmware combination, not a statement that 128 GB is officially supported or guaranteed to work in every MS-A2.

## Why I Tried 128 GB

This MS-A2 is the first physical node in my larger VCF 9.1 lab project. I plan to run physical ESX 9.1, several nested ESX hosts, VCF Automation, VCF Operations, NSX, Supervisor, VKS, and additional workload-domain experiments. I also intend to combine 128 GB of physical DRAM with ESX 9.1 NVMe Memory Tiering later in the build.

That makes memory capacity one of the main constraints. I assembled the barebones machine with the 128 GB Crucial kit and three Samsung 990 PRO NVMe drives. The storage devices have separate planned roles for physical ESX, Memory Tiering, and nested VCF capacity, but I will cover that layout separately. The [home lab architecture article](/homelab/building-a-single-node-nested-vmware-cloud-foundation-9-1-home-lab/) has the complete design and bill of materials.

{{< lab-product-image src="/images/vcf/ms-a2-128gb/00-vcf-homelab-hardware.jpg" alt="Boxes for the MINISFORUM MS-A2, three Samsung 990 PRO NVMe drives, MikroTik networking, CyberPower UPS, and DeskPi RackMate T2 assembled for the VCF 9.1 home lab" caption="The first round of hardware for my nested VCF 9.1 lab, centered on the MINISFORUM MS-A2 and three Samsung 990 PRO NVMe drives." width="420px" height="400px" variant="technical" >}}

## What the Community Had Already Found

There is useful evidence that 128 GB can work on the MS-A2 platform, but the details matter.

[William Lam documented the MS-A2 as a VCF homelab platform](https://williamlam.com/2025/06/vmware-cloud-foundation-vcf-on-minisforum-ms-a2.html) and discussed 128 GB configurations. His separate [128 GB mini PC validation table](https://williamlam.com/2025/02/128gb-memory-mini-pcs-is-now-a-reality-with-64gb-ddr5-sodimm.html) explicitly lists an MS-A2 with the Ryzen 9 7945HX recognizing 128 GB. That was encouraging, but it was not validation of my exact 9955HX system.

[ServeTheHome also tested 128 GB of non-ECC memory in a Zen 5 MS-A2](https://www.servethehome.com/minisforum-ms-a2-review-an-almost-perfect-amd-ryzen-intel-10gbe-homelab-system/). Its review describes the test system as the 16-core Ryzen 9 9955HX and reports a week of stable operation. That is useful independent platform evidence, although the review does not document my exact BIOS procedure.

The most relevant troubleshooting clue came from a [community report involving a 9955HX and the same Crucial CT2K64G56C46S5 kit](https://www.reddit.com/r/homelab/comments/1ps7lnu/minisforum_msa2_with_128_gb_of_ram_not_getting_to/). The system initially would not reach the BIOS, and the author's update reported that setting the RAM speed to 4800 allowed it to recognize 128 GB. That report is anecdotal, not vendor guidance, but it strongly influenced the path I tried.

## My Hardware

| Component | Exact configuration |
|---|---|
| System | [MINISFORUM MS-A2 Workstation](https://www.amazon.com/dp/B0G1MRPY2Z) |
| Processor | AMD Ryzen 9 9955HX, 16 cores / 32 threads |
| Memory | [Crucial CT2K64G56C46S5](https://www.amazon.com/dp/B0DSQMKYLN) |
| DIMMs | 2 x 64 GB DDR5-5600 SODIMM |
| Target result | 128 GB total at DDR5-4800 |

{{< lab-product-image src="/images/vcf/ms-a2-128gb/00-crucial-128gb-kit-packaging.png" alt="Retail package for the Crucial 128 GB DDR5-5600 SODIMM kit containing two 64 GB modules" caption="The Crucial 128 GB DDR5-5600 kit contains two 64 GB SODIMMs for the full-capacity configuration." width="420px" height="400px" variant="technical" >}}

MINISFORUM publishes a 96 GB maximum for the MS-A2. The 128 GB configuration described here is beyond that specification.

## First Boot: 128 GB Would Not POST

I initially installed both 64 GB Crucial SODIMMs and left the memory at its default detected 5600 MT/s speed. When I powered on the MS-A2, the fans spun normally and the system remained powered, but the TV connected over HDMI continued to report no active device or display signal.

I waited approximately 20 minutes because first-boot DDR5 memory training can take longer than a normal boot. The BIOS screen still never appeared. That did not prove a hardware failure. It only showed that this machine was not completing POST with my two-DIMM 128 GB configuration at the default setting.

At that point, isolating the memory configuration was more useful than continuing to wait.

## Testing with One 64 GB DIMM

I powered the MS-A2 down completely, disconnected power, reopened the chassis, and removed one 64 GB DIMM. With a single 64 GB module installed, the system POSTed immediately.

The BIOS Main page reported:

| BIOS field | Value |
|---|---|
| Processor | AMD Ryzen 9 9955HX 16-Core Processor |
| Total Memory | 64 GB (DDR5) |
| Memory Frequency | 5600 MHz |

{{< lab-product-image src="/images/vcf/ms-a2-128gb/01-single-64gb-5600.jpg" alt="MINISFORUM MS-A2 BIOS Main page showing 64 GB of DDR5 memory at 5600 MHz with one Crucial DIMM installed" caption="The MS-A2 POSTed immediately with one 64 GB DIMM and detected it at 5600 MHz." width="420px" height="400px" variant="technical" >}}

That result confirmed the system could POST, the individual DIMM could be detected, and the issue appeared when attempting the full two-DIMM configuration at 5600.

## Finding the Memory Speed Setting

The setting I needed was not in the standard AMD CBS memory menus. Starting from the MINISFORUM BIOS, I used this path:

**Setup → Advanced → AMD Overclocking**

{{< lab-product-image src="/images/vcf/ms-a2-128gb/02-advanced-amd-overclocking.jpg" alt="MINISFORUM MS-A2 Advanced BIOS page with AMD Overclocking selected" caption="The memory target setting is exposed under AMD Overclocking rather than the standard AMD CBS memory menus." width="420px" height="400px" variant="technical" >}}

AMD Overclocking displays a warning that changing settings outside processor specifications or factory settings may affect warranty or support. I selected **Accept** to continue.

{{< lab-product-image src="/images/vcf/ms-a2-128gb/03-amd-overclocking-warning.jpg" alt="AMD Overclocking warning in the MINISFORUM BIOS with Accept and Decline options" caption="Entering AMD Overclocking requires acknowledging AMD's configuration warning." width="420px" height="400px" variant="technical" >}}

## Exact BIOS Path to 4800 MT/s

Inside AMD Overclocking, the complete path was:

**DDR and Infinity Fabric Frequency/Timings → DDR Options → DDR Timing Configuration**

{{< lab-product-image src="/images/vcf/ms-a2-128gb/04-ddr-infinity-fabric.jpg" alt="AMD Overclocking BIOS menu with DDR and Infinity Fabric Frequency and Timings selected" caption="The DDR controls are located under DDR and Infinity Fabric Frequency/Timings." width="420px" height="400px" variant="technical" >}}

{{< lab-product-image src="/images/vcf/ms-a2-128gb/05-ddr-options.jpg" alt="MINISFORUM DDR Options BIOS page with DDR Timing Configuration selected" caption="From DDR Options, I entered DDR Timing Configuration." width="420px" height="400px" variant="technical" >}}

The DDR Timing Configuration page showed **Active Memory Timing Settings: Enabled** and **Memory Target Speed: Auto**. Opening Memory Target Speed exposed the manual MT/s choices.

{{< lab-product-image src="/images/vcf/ms-a2-128gb/06-memory-target-speed-selector.jpg" alt="DDR Timing Configuration BIOS page with the Memory Target Speed selector open and manual MT per second values visible" caption="Memory Target Speed exposes manual MT/s values instead of leaving the configuration on Auto." width="420px" height="400px" variant="technical" >}}

I changed only this setting:

**Memory Target Speed: Auto → 4800 MT/s**

{{< lab-product-image src="/images/vcf/ms-a2-128gb/07-memory-target-speed-4800.jpg" alt="DDR Timing Configuration BIOS page with Memory Target Speed set to 4800 MT/s" caption="I changed only Memory Target Speed to 4800 MT/s and left the other timings and voltages untouched." width="420px" height="400px" variant="technical" >}}

I did not manually change individual DDR timings, voltages, Infinity Fabric settings, Precision Boost Overdrive, SoC voltage, VDD voltage, or any other memory parameter. I saved the BIOS configuration and rebooted with the single DIMM still installed.

Back on the Main page, the BIOS now reported **64 GB (DDR5)** at **4800 MHz**. Verifying the lower target with one DIMM first confirmed that the setting had actually been applied.

{{< lab-product-image src="/images/vcf/ms-a2-128gb/08-single-64gb-4800.jpg" alt="MINISFORUM MS-A2 BIOS Main page showing one 64 GB DDR5 DIMM operating at 4800 MHz" caption="Before reinstalling the second DIMM, I confirmed the single module was now operating at 4800 MHz." width="420px" height="400px" variant="technical" >}}

## Reinstalling the Second DIMM

Once the single 64 GB module had successfully POSTed at 4800, I shut the MS-A2 down and disconnected both AC power and HDMI. I slid the chassis cover off again.

The SODIMM slots sit beneath the internal fan assembly. I removed the three screws securing that assembly and carefully moved it only enough to regain access to the slots. I installed the second 64 GB Crucial DIMM, returning the system to **2 x 64 GB**, then repositioned the fan assembly, reinstalled its three screws, and closed the chassis.

{{< lab-product-image src="/images/vcf/ms-a2-128gb/09-two-64gb-dimms-installed.jpg" alt="Two 64 GB Crucial DDR5-5600 SODIMMs installed in the MINISFORUM MS-A2" caption="Both 64 GB Crucial SODIMMs installed for the final 128 GB configuration." width="420px" height="400px" variant="technical" >}}

Always disconnect power completely before working inside the system, and follow MINISFORUM's hardware installation guidance. This is a record of what I did, not a replacement for the manufacturer's service instructions.

## Success: 128 GB at 4800

I reconnected HDMI and power, then pressed the power button. This time there was no long memory-training wait. The machine came up essentially immediately.

The BIOS Main page reported:

| BIOS field | Value |
|---|---|
| Processor | AMD Ryzen 9 9955HX 16-Core Processor |
| Total Memory | **128 GB (DDR5)** |
| Memory Frequency | **4800 MHz** |

Seeing **128 GB at 4800** appear immediately was a pretty satisfying moment. The workaround had produced exactly the result I needed.

{{< lab-product-image src="/images/vcf/ms-a2-128gb/10-final-128gb-4800.jpg" alt="MINISFORUM MS-A2 BIOS Main page showing the AMD Ryzen 9 9955HX, 128 GB of DDR5 memory, and a 4800 MHz memory frequency" caption="Success: the Ryzen 9 9955HX MS-A2 immediately POSTed with the full 128 GB once the target speed was reduced to 4800 MT/s." width="520px" height="480px" variant="technical" >}}

## Why 4800 Is Fine for My VCF Lab

For this lab, capacity matters more than extracting the maximum memory frequency. My practical choice was a smaller memory configuration at a higher speed or 128 GB working at 4800 MT/s. Nested VCF makes the additional capacity dramatically more valuable.

Multiple nested ESX hosts, vCenter, NSX, VCF Automation, VCF Operations, Supervisor, VKS, and test workloads all compete for memory. The extra 32 to 64 GB of physical DRAM gives me much more room to run that stack. There can be a performance difference between DDR5-4800 and DDR5-5600, but maximizing memory bandwidth is not the primary architectural goal of this system.

## What I Have Validated

As of August 14, 2026, I have personally verified this exact combination on my hardware:

- MINISFORUM MS-A2 with AMD Ryzen 9 9955HX
- Crucial CT2K64G56C46S5, 2 x 64 GB
- 128 GB total at DDR5-4800
- Successful POST
- Full 128 GB recognized in the BIOS

## What I Still Need to Test

This successful POST is an important checkpoint, but it is not a complete stability validation. I have not yet verified:

- Long-term memory stability or a full memory stress test
- MemTest results
- ESX 9.1 recognition of the full 128 GB
- ESX stability under load
- NVMe Memory Tiering
- Nested VCF 9.1 resource behavior
- Thermal behavior under sustained VCF workloads

I will keep the distinction between "recognized in BIOS" and "stable under virtualization load" clear as the build progresses.

## Lab Disclaimer

This is a homelab experiment, not production hardware guidance or production VCF sizing advice. A 128 GB configuration is beyond MINISFORUM's published specification for this system. My result applies to my particular hardware and firmware combination, and another MS-A2 may behave differently. Changing settings under AMD Overclocking can affect support or warranty and should be done at your own risk. I am intentionally prioritizing lab capacity over the maximum memory frequency.

## References

- [MINISFORUM MS-A2 product page](https://store.minisforum.com/products/minisforum-ms-a2-workstation)
- [William Lam: VMware Cloud Foundation on MINISFORUM MS-A2](https://williamlam.com/2025/06/vmware-cloud-foundation-vcf-on-minisforum-ms-a2.html)
- [William Lam: 128 GB memory mini PCs with 64 GB DDR5 SODIMMs](https://williamlam.com/2025/02/128gb-memory-mini-pcs-is-now-a-reality-with-64gb-ddr5-sodimm.html)
- [ServeTheHome: MINISFORUM MS-A2 review](https://www.servethehome.com/minisforum-ms-a2-review-an-almost-perfect-amd-ryzen-intel-10gbe-homelab-system/)
- [Reddit r/homelab: MS-A2 9955HX and 128 GB at 4800](https://www.reddit.com/r/homelab/comments/1ps7lnu/minisforum_msa2_with_128_gb_of_ram_not_getting_to/)

## What's Next

With the MS-A2 now recognizing all 128 GB of physical DRAM, my next steps are to verify all three Samsung 990 PRO NVMe drives, complete memory stability testing, install physical ESX 9.1, and confirm that ESX sees the full capacity. After that, I can configure the dedicated NVMe Memory Tiering drive, build the isolated MikroTik lab network, and begin deploying nested VCF 9.1.

This was the first real hardware hurdle of the build. It is now cleared, and the machine is ready for the validation work that matters next.
