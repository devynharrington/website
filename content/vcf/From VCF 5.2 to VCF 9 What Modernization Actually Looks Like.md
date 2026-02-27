+++
title = "From VCF 5.2 to VCF 9: What Modernization Actually Looks Like"
date = "2026-02-26"
draft = false
description = "A practical look at why moving from VCF 5.2 to VCF 9 is an architectural transition, not a simple upgrade, and how the greenfield decision changes everything."
tags = ["VCF", "VMware", "NSX"]
categories = ["VCF"]

showDate = true
showReadingTime = true
showWordCount = false
+++

Part 1 of a VCF 5.2 to 9 Modernization Series

When customers talk about upgrading VMware Cloud Foundation, it sounds simple.

Just upgrade to the latest version.

In reality, moving from VCF 5.2 to VCF 9 is not an upgrade. It is an architectural transition.

Over the past several months, I’ve had the opportunity to support that transition in a federal environment. Here are the biggest lessons.

---

## The Greenfield Question

When I stepped into this engagement, the environment was running VCF 5.2.

The first real decision was not technical. It was architectural.

Do we attempt an in place upgrade?

Or do we redeploy clean with VCF 9?

That decision shapes everything that follows.

On paper, an in place upgrade sounds efficient. Keep what you have. Upgrade components. Move forward.

In reality, architecture carries history.

> Architecture decisions do not disappear during upgrades.  
> They compound.

---

## Architecture Carries History

VCF 5.2 was built around a management model that looks very different from VCF 9.

In many environments, that 5.2 management stack included SDDC Manager, vCenter, NSX, Aria Suite Lifecycle Manager, Aria Operations, Aria Automation, Aria Operations for Logs, Aria Operations for Networks, and Identity Manager.

Aria Suite Lifecycle Manager was responsible for deploying and managing the Aria products. You could deploy Aria independently of VCF, or you could integrate it as VCF aware. If you chose the VCF aware model, you needed to deploy an Application Virtual Network so SDDC Manager could communicate with Aria Suite Lifecycle.

That AVN introduced additional IP requirements, DNS entries, and routing considerations across Region A and X Region segments, plus long term lifecycle dependencies. If Aria was deployed independently, the AVN was not required. Once you tightly coupled Aria to VCF, that dependency became part of the design.

The flexibility was powerful, but it created layers.

VCF 9 shifts the model.

VCF Installer replaces Cloud Builder for bring up. It deploys vCenter, NSX, and SDDC Manager. SDDC Manager still exists in VCF 9, but it is considered deprecated and its lifecycle responsibilities are shifting toward Fleet Management.

From there, lifecycle control moves into Fleet Management. Each deployment becomes a VCF Instance under a Fleet, and operational visibility consolidates into VCF Operations.

VCF Automation capabilities are embedded within VCF Operations. VCF Operations for Logs and VCF Operations for Networks are introduced as Day 2 components rather than being lifecycle managed through an external Aria Suite Lifecycle Manager. The platform is intentionally more unified and far less dependent on external lifecycle tooling or AVN constructs just to achieve integration.

That consolidation sounds simple. It is not.

---

## What Actually Changes in VCF 9

The number of required IP addresses changes. Appliance roles change. VIP usage patterns shift. Identity handling becomes more centralized. Certificate trust requirements become stricter. Reverse proxy and service registry behavior in VCF 9 assume clean FQDN alignment and strong DNS hygiene.

In 5.2, Aria and VCF could be loosely coupled or tightly coupled depending on design decisions. In 9, the platform assumes a more unified operational model built around Fleet Management and VCF Operations.

If you attempt an in place upgrade while carrying forward every appliance, every AVN decision, every DNS shortcut, and every IP pool from 5.2, complexity multiplies quickly.

IP pools must be recalculated. VIP assignments must be validated. Certificate chains must align across management and workload domains. NAT configurations that may have functioned previously can cause instability in 9 because control plane services expect consistent, routable FQDN resolution.

Now multiply that by federal compliance requirements, STIG constraints, and strict change control.

That is when the greenfield conversation becomes serious.

---

## Why Greenfield Made More Sense

A clean VCF 9 deployment lets you reset the parts that usually cause friction later.

It allows you to recalculate IP planning from scratch, align DNS records properly from day one, remove legacy AVN constructs, standardize certificate trust early, intentionally separate TEP pools across domains, and avoid carrying forward deprecated lifecycle components.

Modernization projects rarely fail because the new platform cannot handle the workload.

They struggle because historical design decisions follow you forward.

Greenfield does not mean starting over recklessly.

It means deciding not to inherit technical debt.

---

## Planning Matters More Than Bring Up

One of the most valuable tools during this process was VMware’s official VCF 9 planning workbook. It forces you to think through management domain IP allocations, workload domain separation, NSX uplink design, DNS forward and reverse validation, certificate planning, and depot separation between infrastructure components and product components under Fleet Management.

---

### Planning Resource

For anyone preparing for a 5.x to 9 transition, here is the official VCF 9 planning workbook:

👉 [Download the VCF 9 Planning Workbook](/downloads/vcf-9.0-planning-and-preparation-workbook.xlsx)

The bring up wizard is the easy part.

The architecture decisions are where the real work happens.