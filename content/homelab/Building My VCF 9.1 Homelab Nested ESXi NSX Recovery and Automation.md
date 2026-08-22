+++
title = "Deploying a Complete VCF 9.1 Management Domain: Nested ESXi, NSX Recovery, and Automation"
date = "2026-08-21"
draft = false
slug = "deploying-a-complete-vcf-9-1-management-domain-nested-esxi-nsx-recovery-and-automation"
aliases = ["/homelab/building-my-vcf-9-1-homelab-nested-esxi-nsx-recovery-automation/"]
description = "How I deployed a complete VCF 9.1 management domain in a nested homelab, recovered orphaned NSX transport nodes, and fixed VCF Automation."
images = ["/images/vcf/vcf-9-1-nested-management-domain/40-vcf-9-1-deployment-congratulations.png"]
featureimage = "images/vcf/vcf-9-1-nested-management-domain/40-vcf-9-1-deployment-congratulations.png"
hideFeatureImage = true
keywords = ["VMware Cloud Foundation 9.1", "VCF 9.1 homelab", "Nested ESXi", "VCF Installer", "NSX transport node recovery", "VCF Automation", "PowerCLI macOS", "MINISFORUM MS-A2"]
tags = ["VCF", "VMware Cloud Foundation", "VCF 9.1", "Home Lab", "Nested ESX", "NSX", "VCF Automation", "PowerCLI", "MINISFORUM MS-A2"]
categories = ["Home Lab"]

showDate = true
showReadingTime = true
showWordCount = false
showTableOfContents = true
+++

This was the biggest milestone in my VCF 9.1 homelab so far. One physical MS-A2 runs the outer ESXi host and vCenter, and that single node now hosts the entire nested VCF environment. In the [previous article](/homelab/building-my-vcf-9-1-homelab-bare-metal-esxi-vcenter-vis/), I prepared that physical layer with 128 GB of DRAM, even though MINISFORUM officially lists 96 GB as the maximum, and configured 1:4 NVMe Memory Tiering. ESXi then reported roughly 628 GB of total memory capacity for the lab.

For this phase, I customized William Lam's Fleet lab automation to deploy the VCF Installer and six nested ESXi VMs, then generate the initial management-domain JSON. Three nested hosts became the management-domain cluster, while the other three were staged for a future workload domain. The VCF Installer then used that specification to configure the management vCenter, vSAN, NSX, SDDC Manager, VCF Operations, Management Services, and Automation.

It was not a single-click deployment. I recovered two hosts from broken NSX state, corrected an overcorrection from 32 to 16 vCPUs that left no host large enough for Automation's 24-vCPU VM, fixed an address overlapping its runtime pool, removed stale Fleet metadata, and learned that an apparently frozen deployment can still be working.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/39-vcf-9-1-deployment-complete.png" alt="VCF Installer home screen showing the management-domain deployment completed successfully" caption="The payoff on August 21: the full VCF 9.1 management-domain deployment completed successfully, including VCF Automation." width="1000px" height="auto" variant="technical" >}}

{{< alert icon="triangle-exclamation" >}}
**LAB CONTEXT:** This is a resource-constrained nested environment running on one physical AMD host. I followed Broadcom documentation and referenced KBs where applicable, but the sizing decisions, acknowledged warnings, and recovery steps reflect my lab. Validate the current guidance for your environment and engage Broadcom Support before force-removing an NSX transport node in production.
{{< /alert >}}

## The Starting Point

The outer environment consisted of one physical MS-A2 running ESXi 9.1, an initial vCenter at `vc01.lab.devynharrington.com`, and a management network on `192.168.88.0/24`. A MikroTik router supplied DNS for the isolated lab. The 4 TB `nested-vcf` datastore held the appliances and nested hosts, while the dedicated NVMe memory tier gave the physical ESXi host roughly 628 GB of reported memory capacity.

I intentionally did not enable DRS on the outer cluster. With one physical host there was nowhere for DRS to move a VM, so it offered no placement value at this stage.

## Preparing the Physical ESXi Host

Before launching the nested build, I followed [William Lam's VCF 9.1 lab guidance for AMD Ryzen systems](https://williamlam.com/2026/05/vcf-9-1-comprehensive-esx-configuration-workarounds-for-lab-deployments.html). I set the kernel entropy source, retained the 400 percent NVMe Memory Tiering configuration from the previous build day, and added the documented APIC virtualization workaround to `/etc/vmware/config`:

```shell
esxcli system settings kernel set -s entropySources -v 2
```

```text
monitor_control.disable_apichv = "TRUE"
```

I explicitly persisted the configuration and rebooted the physical host:

```shell
/sbin/auto-backup.sh
reboot
```

After the reboot I verified the entropy value, memory tier, NTP synchronization, and the `disable_apichv` line rather than assuming the settings had survived:

```shell
esxcli system settings kernel list -o entropySources
esxcli memtier status get
esxcli system ntp get
grep -n "monitor_control.disable_apichv" /etc/vmware/config
```

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/01-physical-host-settings-verified.png" alt="ESXi shell showing entropySources set to 2, NVMe Memory Tiering enabled at 400 percent, and synchronized NTP" caption="The physical host checks passed after reboot: entropy, 1:4 NVMe Memory Tiering, and NTP were all intact." width="850px" height="auto" variant="technical" >}}

These settings were specific accommodations for my AMD-based nested lab. They should be evaluated against the current product guidance for the exact hardware and ESXi build being used.

## Running PowerCLI Natively on the Mac Mini

I used the Mac mini as the deployment workstation and ran PowerShell 7 and VMware PowerCLI natively on macOS. This kept the automation workflow on the system I was already using to manage the lab, without adding another VM to the environment.

The first Homebrew command I tried used the former cask and no longer worked. The current formula installed PowerShell successfully:

```bash
brew install powershell
pwsh
```

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/02-powershell-7-on-macos.png" alt="macOS Terminal running PowerShell 7.6.5 natively on ARM64" caption="PowerShell 7.6.5 running natively on the Mac mini." width="395px" height="auto" variant="technical" >}}

Inside PowerShell I installed PowerCLI for my user, validated the module, and set the certificate behavior for the self-signed homelab endpoints:

```powershell
Install-Module VMware.PowerCLI -Scope CurrentUser
Get-Module VMware.PowerCLI -ListAvailable
Set-PowerCLIConfiguration -InvalidCertificateAction Ignore -Confirm:$false
```

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/03-powercli-module-validated.png" alt="PowerShell showing VMware PowerCLI 13.3.0 installed for the current macOS user" caption="PowerCLI was installed and visible to PowerShell before I touched the deployment scripts." width="760px" height="auto" variant="technical" >}}

I then proved the Mac could connect to the outer vCenter and query the physical ESXi host:

```powershell
Connect-VIServer vc01.lab.devynharrington.com
Get-VMHost
```

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/04-powercli-connected-to-physical-vcenter.png" alt="PowerCLI connected to the physical vCenter and reporting the ESXi host capacity" caption="The Mac mini had a working PowerCLI session to the physical vCenter. The password in the prompt is masked." width="850px" height="auto" variant="technical" >}}

## Starting with William Lam's Automation

The automation was not something I wrote from scratch. I started with William Lam's [VCF 9.1 automated nested-lab article](https://williamlam.com/2026/05/vcf-9-1-automated-vmware-cloud-foundation-vcf-vmware-vsphere-foundation-vvf-nested-lab-deployment.html) and his [VCF Fleet Automated Lab Deployment repository](https://github.com/lamw/vcf-fleet-automated-lab-deployment). His work handled the repetitive deployment of the VCF Installer and nested ESXi appliances, hardware reconfiguration, and management-domain JSON generation.

I kept William's base scripts as references and created an environment-specific configuration containing my vCenter target, datastore, OVA paths, DNS and networking, six nested-host definitions, hardware sizing, and VCF service addresses. His automation can use an online depot token when one is available:

```powershell
$VCFInstallerSoftwareDepot = "online"
$VCFInstallerDepotToken = "<BROADCOM_DOWNLOAD_TOKEN>"
```

I did not have a token, so my working copy used these controls:

```powershell
$configureVCFInstallerConfig = 0
$startVCFBringup = 0
```

The first setting deferred Software Depot configuration, and the second prevented the script from submitting the generated JSON for bring-up. I completed the Business Services Console activation-code workflow manually later. Download tokens and activation codes should not be committed to a public configuration file.

I also enabled staging for the three future workload hosts. Before running the automation, I used the PowerShell parser to check all three files for syntax errors without executing them:

```powershell
$files = @(
  "./devyn-vcf-9.1.0-v2.ps1",
  "./devyn-vcf-automated-fleet-deployment-FINAL.ps1",
  "./vcf-automated-wld-deployment.ps1"
)

foreach ($file in $files) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path $file), [ref]$tokens, [ref]$errors
  ) | Out-Null

  if ($errors.Count -eq 0) {
    Write-Host "$file : PARSE OK"
  } else {
    Write-Host "$file : ERRORS FOUND"
    $errors
  }
}
```

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/05-powershell-script-parse-checks.png" alt="PowerShell parser reporting PARSE OK for the three VCF deployment scripts" caption="The parser check completed successfully for all three PowerShell files before I ran the automation." width="680px" height="auto" variant="technical" >}}

## Preparing the Initial DNS Records

VCF made DNS correctness impossible to ignore, which is a good thing. Before running the automation, I created an initial batch of 13 core records on the MikroTik for the Installer, nested ESXi hosts, SDDC Manager, vCenter, NSX VIP, Operations endpoint, and planned workload-domain systems. I checked representative forward and reverse lookups, but that initial batch was not the complete VCF 9.1 service namespace. The first JSON validation later revealed the additional names I had missed.

I added those initial static records in one MikroTik terminal session, then ran representative queries from the Mac:

```bash
nslookup inst01.vcf.lab.devynharrington.com 192.168.88.1
nslookup nested-esx01.vcf.lab.devynharrington.com 192.168.88.1
nslookup sddcm01.vcf.lab.devynharrington.com 192.168.88.1
```

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/06-mikrotik-vcf-dns-records.png" alt="MikroTik DNS static-record list containing the initial VCF management and workload hostnames" caption="I created the initial core records on the MikroTik before running the script. This was only the first batch; JSON validation later exposed additional VCF service names that also needed records." width="700px" height="auto" variant="technical" >}}

## Deploying the Nested Infrastructure

I validated the OVA paths and the destination resources before starting the main script:

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/08-ova-paths-and-files-validated.png" alt="PowerShell showing valid local paths for the Nested ESXi appliance and VCF Installer OVA" caption="The large appliance files, paths, and script inputs were checked before deployment." width="780px" height="auto" variant="technical" >}}

The Fleet deployment script connected to the outer vCenter and presented PowerCLI's multiple-default-server prompt. I selected No, keeping PowerCLI in single-default-server mode for that session so commands without an explicit server target would use the most recently connected server.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/09-first-powercli-multiple-server-prompt.png" alt="PowerCLI multiple default server behavior prompt at the beginning of the VCF script run" caption="I selected No at the multiple-default-server prompt, keeping single-server behavior for this session." width="900px" height="auto" variant="technical" >}}

After I selected No, the automation began deploying `inst01` and the nested ESXi hosts using my configuration.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/10-vcf-installer-ova-deployment.png" alt="PowerShell automation reporting that the VCF Installer VM deployment and guest configuration completed" caption="The script deployed `inst01`, waited for it to become reachable, and applied its guest-side configuration." width="900px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/11-nested-esxi-script-progress.png" alt="PowerShell automation deploying and reconfiguring nested ESXi virtual machines" caption="Each nested host was deployed and then reconfigured with the lab CPU, memory, networking, cache, and capacity-disk settings." width="900px" height="auto" variant="technical" >}}

The final PowerShell summary confirmed that all six nested hosts had been processed and that `vcf-mgmt-3mnzy4kg.json` had been generated in the working directory. The run completed in about 10 minutes. The script's generic duration message mentions starting the VCF deployment, but automatic bring-up was disabled in my configuration, so no management-domain request was submitted at this point.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/11b-fleet-script-completed.png" alt="PowerShell showing William Lam's VCF Fleet deployment script completing after deploying six nested ESXi hosts and generating the management-domain JSON" caption="The automation completed its infrastructure phase, generated the management-domain JSON, disconnected from the physical vCenter, and returned control to me before bring-up." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/12-six-nested-hosts-and-installer-deployed.png" alt="Physical vCenter inventory showing the VCF Installer and six nested ESXi virtual machines" caption="The supporting nested infrastructure was in place. Hosts 01 through 03 were for the management domain, while 04 through 06 were reserved for the later workload-domain phase." width="255px" height="auto" variant="technical" >}}

### The Script Generates the JSON Used by the Installer

An important output of the script was easy to miss among the deployed VMs and log files. After building the nested hosts, it generated a management-domain specification in the same working directory. In my run that file was named `vcf-mgmt-3mnzy4kg.json`; the generated suffix can differ between runs.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/12b-generated-management-domain-json.png" alt="macOS Finder showing the generated vcf-mgmt-3mnzy4kg.json management-domain specification beside the VCF deployment scripts and logs" caption="The script produced `vcf-mgmt-3mnzy4kg.json` after deploying the nested infrastructure. This was the file I later uploaded through Deploy Using JSON Spec in the VCF Installer." width="760px" height="auto" variant="technical" >}}

That JSON is the handoff between the two phases:

```text
PowerCLI automation
  -> deploys the VCF Installer and nested ESXi VMs
  -> configures the nested VM hardware
  -> generates vcf-mgmt-<generated-suffix>.json

VCF Installer
  -> imports the generated JSON
  -> validates and corrects the specification
  -> performs the VCF management-domain deployment
```

I uploaded the generated JSON without fully comparing its DNS records with its address pools. Installer validation caught several issues, but an Automation addressing conflict survived and surfaced later in the deployment.

## Staging VCF 9.1 in the Installer

The VCF Installer web interface came online at `inst01`. I logged in, opened depot and binary management, and used the VCF 9.1 Software Depot registration flow. The Installer supplied a Download Service ID, which I registered in Broadcom's console to obtain an activation code.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/13-vcf-installer-first-login.png" alt="VCF Installer home page before depot configuration or management-domain deployment" caption="The freshly deployed VCF Installer was reachable, but had no binaries or deployment in progress yet." width="1000px" height="auto" variant="technical" >}}

### Registering the Software Depot in the Business Services Console

The VCF Installer did not generate the activation code itself. It displayed a unique Download Service ID in the Online Depot dialog and directed me to the [Broadcom Business Services Console](https://vcf.broadcom.com/). From there I used this sequence:

1. In the VCF Installer, open Depot Settings and Binary Management and choose the online depot.
2. Copy the Download Service ID shown by the Installer.
3. In the Broadcom Business Services Console, open Software Depot Registration.
4. Select Register Software Depot.
5. Paste the Installer's Download Service ID, give the registration a recognizable name, and select Register.
6. Copy the one-time activation code returned by the console.
7. Return to the Installer, paste that value into Activation Code, and select Authenticate.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/14-business-console-software-depot-registrations-redacted.png" alt="Broadcom Business Services Console with Software Depot Registration selected and the Register Software Depot button visible, with the Site ID redacted" caption="In the Business Services Console, I opened Software Depot Registration and selected Register Software Depot. The account Site ID is redacted." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/14-business-console-software-depot-registration-redacted.png" alt="Broadcom Business Services Console Register Software Depot form with the VCF Installer Download Service ID redacted and a descriptive depot name entered" caption="I copied the Download Service ID from `inst01` into the Business Services Console and named the registration `Devyn VCF 9.1 Lab`. The unique ID is redacted because readers must use the ID generated by their own Installer." width="900px" height="auto" variant="technical" >}}

The Business Services Console warned that the activation code could not be retrieved again after finishing the dialog. I copied it directly into the Installer and authenticated the depot before closing that screen.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/14c-business-console-activation-code-redacted.png" alt="Broadcom Business Services Console confirming successful Software Depot registration with the one-time activation code fully redacted" caption="The console generated the one-time activation code after registration. I copied it before selecting Finish; the complete credential is redacted here." width="900px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/14d-installer-online-depot-credentials-redacted.png" alt="VCF Installer Online Depot dialog with the Download Service ID and pasted activation code fully redacted before authentication" caption="Back in the Installer, I pasted the activation code and selected Authenticate. Both the Download Service ID and activation code are redacted." width="900px" height="auto" variant="technical" >}}

These redacted screenshots preserve the complete registration handoff without publishing either reusable value.

I uploaded the generated JSON before downloading the binaries. That did not start deployment; it let the Installer expose missing DNS records and ESXi thumbprints while I was still preparing the environment. Deployment began only after validation and the final deployment action.

### The First JSON Upload Exposed the Missing DNS Records

The first validation run confirmed that the three management hosts were missing SSL thumbprints. It also showed that my original DNS batch was incomplete.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/16a-validation-missing-esxi-thumbprints.png" alt="VCF Installer validation errors reporting missing SSL thumbprints for all three nested ESXi management hosts" caption="The first JSON upload reported missing certificate thumbprints for `nested-esx01`, `nested-esx02`, and `nested-esx03`." width="1000px" height="auto" variant="technical" >}}

The DNS errors arrived across several validation result screens. Together they identified ten names that were absent from the initial MikroTik records: `vcf01`, `vcf-proxy01`, `vcf-lic01`, `vcf-msr01`, `vcf-int01`, `vcf-flt01`, `vcf-idb01`, `auto01`, `vcf-asr01`, and `nsx01a`.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/16c-validation-missing-service-dns.png" alt="VCF Installer validation errors showing unresolved VCF Operations, proxy, licensing, and Management Services Runtime names" caption="The first DNS validation screen identified four service FQDNs missing from my initial MikroTik records." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/16d-validation-missing-management-services-dns.png" alt="VCF Installer validation errors showing unresolved Management Services Runtime, Operations instance, Fleet, and Identity Broker names" caption="The next results identified the remaining Management Services names required by the generated specification." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/16e-validation-missing-automation-dns.png" alt="VCF Installer validation errors showing unresolved VCF Automation and Automation services-runtime names" caption="Automation added two more required records: its service endpoint and services-runtime platform FQDN." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/16f-validation-missing-nsx-dns.png" alt="VCF Installer validation error showing the unresolved NSX Manager node name" caption="The final missing record in that pass was the individual NSX Manager node, `nsx01a`." width="1000px" height="auto" variant="technical" >}}

Rather than add the records one dialog at a time, I opened a MikroTik terminal and pasted the missing entries as one RouterOS batch. These are the addresses I used at this preflight stage:

```routeros
/ip dns static
add name=nsx01a.vcf.lab.devynharrington.com address=192.168.88.61
add name=vcf01.vcf.lab.devynharrington.com address=192.168.88.62
add name=vcf-msr01.vcf.lab.devynharrington.com address=192.168.88.63
add name=vcf-flt01.vcf.lab.devynharrington.com address=192.168.88.64
add name=vcf-int01.vcf.lab.devynharrington.com address=192.168.88.65
add name=vcf-lic01.vcf.lab.devynharrington.com address=192.168.88.66
add name=vcf-idb01.vcf.lab.devynharrington.com address=192.168.88.67
add name=vcf-proxy01.vcf.lab.devynharrington.com address=192.168.88.68
add name=vcf-asr01.vcf.lab.devynharrington.com address=192.168.88.69
add name=auto01.vcf.lab.devynharrington.com address=192.168.88.70
```

Those were early preflight values, not the final known-good addressing summarized after validation below.

I then verified the entire added batch from the Mac mini. A loop makes the same check easier to repeat than issuing ten separate commands:

```bash
for host in \
  nsx01a vcf01 vcf-msr01 vcf-flt01 vcf-int01 \
  vcf-lic01 vcf-idb01 vcf-proxy01 vcf-asr01 auto01
do
  nslookup "${host}.vcf.lab.devynharrington.com" 192.168.88.1
done
```

After I re-uploaded the JSON, the missing-name findings cleared. The remaining host-certificate findings led directly to the next CLI check.

### Collecting the ESXi Thumbprints from the Mac Mini

The generated specification contained `skipEsxThumbprintValidation: true`, but the Installer still reported missing SSL thumbprints for all three management hosts. Instead of opening each ESXi certificate through a browser, I collected all three SHA-256 fingerprints from Terminal on the Mac mini:

```bash
for host in \
  nested-esx01.vcf.lab.devynharrington.com \
  nested-esx02.vcf.lab.devynharrington.com \
  nested-esx03.vcf.lab.devynharrington.com
do
  echo "===== $host ====="
  echo | openssl s_client -connect "${host}:443" -servername "${host}" 2>/dev/null \
    | openssl x509 -noout -fingerprint -sha256
  echo
done
```

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/16b-mac-esxi-thumbprints-redacted.png" alt="macOS Terminal on the Mac mini showing an OpenSSL loop retrieving SHA-256 certificate fingerprints from all three nested ESXi hosts with the fingerprint values redacted" caption="The Mac mini retrieved all three ESXi certificate fingerprints in one pass. The commands and hostnames remain visible. I redacted the environment-specific values because readers must retrieve and verify the certificates presented by their own ESXi hosts." width="1000px" height="auto" variant="technical" >}}

My terminal happened to be in the `VCF91-Lab` project directory, but OpenSSL did not depend on that folder. The command connects directly to each ESXi host over HTTPS and can be run from any directory. The project directory matters only when scripts or JSON files are referenced by relative path.

I added each returned value to the `sslThumbprint` property of the matching host object in the deployment JSON. After another upload, `nested-esx02` and `nested-esx03` were accepted immediately. I recaptured `nested-esx01` by itself and corrected its entry, after which all three thumbprint findings disappeared.

Each entry belonged inside the matching object in the JSON's `hostSpecs` array:

```json
"hostSpecs": [
  {
    "hostname": "nested-esx01.vcf.lab.devynharrington.com",
    "credentials": {
      "username": "root",
      "password": "<ESXI_ROOT_PASSWORD>"
    },
    "sslThumbprint": "<SHA-256-THUMBPRINT>"
  }
]
```

I repeated that `sslThumbprint` field for `nested-esx02` and `nested-esx03` using the value retrieved from each host.

After that initial JSON check, I returned to the authenticated depot, selected the VCF 9.1 components required by the specification, including the larger VCF Operations, Management Services, and Automation payloads, and waited for every required download to complete.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/14-online-depot-connected.png" alt="VCF Installer showing an active connection to the online software depot" caption="The online depot was authenticated and ready to serve the VCF 9.1 binaries." width="700px" height="auto" variant="technical" >}}

The first download-progress screenshot was captured at 11:03:14 PM, and the completed view was captured at 11:30:44 PM. That put the approximately 65 GB download at roughly 28 minutes on my home connection. Download time will vary substantially with internet bandwidth, depot performance, proxy inspection, and whether the binaries must be transferred into a disconnected environment.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/15b-vcf-binaries-fully-downloaded.png" alt="VCF Installer Binary Management page showing every required VCF 9.1 component with a successful download status" caption="All required VCF 9.1 binaries were fully downloaded before I returned to the deployment workflow. The complete set took about 28 minutes in my lab." width="1000px" height="auto" variant="technical" >}}

With the binaries staged, I returned to Deploy Using JSON Spec and re-uploaded the corrected specification. The earlier pre-download upload had already exposed the missing ESXi SSL thumbprints and DNS issues; the remaining validation included capacity and compatibility warnings relevant to a nested lab.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/16-json-spec-uploaded.png" alt="VCF Installer Deploy Using JSON Spec wizard with the deployment specification uploaded" caption="After staging the binaries, I re-uploaded the corrected specification and continued into formal validation." width="900px" height="auto" variant="technical" >}}

Formal validation then found two names resolving to `192.168.88.62`: my planned VCF Operations name, `ops01`, and `vcf01` from the generated JSON. I standardized the final JSON and DNS on `ops01`, removed the duplicate record, and reran validation.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/07b-installer-duplicate-reverse-dns-validation.png" alt="VCF Installer DNS Resolution validation warning reporting that 192.168.88.62 returned both ops01 and vcf01 FQDNs" caption="Installer validation found two names for the Operations address. I standardized the final configuration on `ops01`." width="1000px" height="auto" variant="technical" >}}

After correcting the missing DNS records, duplicate Operations mapping, and host thumbprints, I re-uploaded the JSON and reran validation. No errors remained. I reviewed and acknowledged the expected nested vSAN HCL and capacity warnings, which enabled Next.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/17-final-validation-no-errors.png" alt="VCF Installer final validation screen with successful checks, the expected nested vSAN HCL and capacity warnings acknowledged, and Next enabled" caption="The final validation had no errors. The expected nested-hardware and capacity warnings were acknowledged after review, and the Installer enabled Next." width="1000px" height="auto" variant="technical" >}}

The final validated specification used these endpoints:

| Function | FQDN | Address or pool |
|---|---|---|
| Nested ESXi 01 | `nested-esx01.vcf.lab.devynharrington.com` | `192.168.88.41` |
| Nested ESXi 02 | `nested-esx02.vcf.lab.devynharrington.com` | `192.168.88.42` |
| Nested ESXi 03 | `nested-esx03.vcf.lab.devynharrington.com` | `192.168.88.43` |
| VCF Installer | `inst01.vcf.lab.devynharrington.com` | `192.168.88.50` |
| SDDC Manager | `sddcm01.vcf.lab.devynharrington.com` | `192.168.88.51` |
| Management vCenter | `vc01.vcf.lab.devynharrington.com` | `192.168.88.52` |
| NSX VIP | `nsx01.vcf.lab.devynharrington.com` | `192.168.88.60` |
| NSX Manager node | `nsx01a.vcf.lab.devynharrington.com` | `192.168.88.61` |
| VCF Operations | `ops01.vcf.lab.devynharrington.com` | `192.168.88.62` |
| Management Services Runtime | `vcf-msr01.vcf.lab.devynharrington.com` | `192.168.88.193-222` pool |
| VCF Operations instance | `vcf-int01.vcf.lab.devynharrington.com` | Management-services pool |
| Fleet | `vcf-flt01.vcf.lab.devynharrington.com` | Management-services pool |
| Identity Broker | `vcf-idb01.vcf.lab.devynharrington.com` | Management-services pool |
| Operations Collector | `vcf-proxy01.vcf.lab.devynharrington.com` | Management-services pool |
| Automation | `auto01.vcf.lab.devynharrington.com` | Automation service endpoint |
| Automation runtime | `vcf-asr01.vcf.lab.devynharrington.com` | `192.168.88.223` |
| Automation runtime pool | Dynamic runtime nodes | `192.168.88.224-228` |
| License service | `vcf-lic01.vcf.lab.devynharrington.com` | Management-services pool |

The corrected deployment specification used for bring-up also defined the `sddc1-cl01-vds01` distributed switch, 8940-byte vMotion and vSAN MTUs, and the `10.1.34.101-118` NSX TEP pool.

## Watching the Management Domain Take Shape

I started the deployment shortly after midnight, once the kids were asleep and the house was finally quiet. It was the perfect homelab maintenance window, although I paid for that decision the next morning. The Installer validated and commissioned the three hosts, deployed the management vCenter, created `vcf-mgmt-dc` and `vcf-mgmt-cl01`, configured vSAN, and moved into NSX.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/18-management-domain-entering-nsx.png" alt="VCF Installer showing SDDC Manager and vSphere cluster configuration complete while NSX deployment is in progress" caption="By 1:23 AM, SDDC Manager had reached 18/18, cluster configuration had reached 133/133, and the Installer was actively deploying NSX at 17/94." width="1000px" height="auto" variant="technical" >}}

In this nested lab, progress did not always move quickly or look smooth. The percentage sometimes stayed at the same number for a long time even though work was still happening behind the scenes. That became especially important during NSX and Automation.

## Fixing the Create Transport Node Collection Failure

The first major failure occurred during **Create Transport Node Collection**. The Installer had made it through vCenter and most of the NSX work, but NSX had not configured one or more host transport nodes correctly.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/19-create-transport-node-collection-failure.png" alt="VCF Installer reporting a failure while creating the NSX Transport Node Collection" caption="The original blocker appeared in the NSX milestone at Create Transport Node Collection." width="1000px" height="auto" variant="technical" >}}

NSX's host view showed `nested-esx01` stalled at **Waiting for connection to Managers**, while `nested-esx02` had NSX packages installed but no usable manager registration.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/20-nsx-waiting-for-manager-connection.png" alt="NSX installation progress stalled while waiting for a host connection to managers" caption="The packages were present, but a healthy transport-node identity and manager connection were not." width="500px" height="auto" variant="technical" >}}

### Diagnostics That Separated Reachability from Registration

On each affected ESXi host I checked the NSX CLI, proxy state, and installed components:

```shell
nsxcli
get managers
get controllers
```

```shell
esxcli software vib list | grep -i nsx
esxcli software component list | grep -i nsx
```

On `nested-esx02`, `get managers` returned **No managers configured**. Restarting `nsx-proxy` also complained that its transport-node UUID did not exist. That combination was more specific than a generic network problem: the NSX packages were installed, but this host did not have a usable transport-node registration.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/21-nsx-no-managers-configured-cropped-final.png" alt="NSX CLI on nested-esx02 showing get managers returning No managers configured" caption="The host had no configured NSX manager, directly showing that its registration state was incomplete." width="600px" height="auto" variant="technical" >}}

I also tested DNS and the ports used by the manager connection:

```shell
nslookup nsx01a.vcf.lab.devynharrington.com
nc -z 192.168.88.61 443
nc -vz 192.168.88.61 1234
nc -vz 192.168.88.61 1235
```

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/22-nsx-manager-port-connectivity.png" alt="ESXi shell showing successful TCP connectivity from a nested host to the NSX Manager node" caption="Basic TCP reachability to the manager succeeded. The broken piece was registration state, not the path to `192.168.88.61`." width="760px" height="auto" variant="technical" >}}

The address distinction mattered during troubleshooting: `192.168.88.60` was the NSX VIP, while the actual NSX Manager node `nsx01a` used `192.168.88.61`. NSX Manager services and cluster state were stable by the time I performed the host recovery.

### Recovering One NSX Host at a Time

The successful recovery was controlled and host-specific. I did not tear down the cluster or clean all hosts simultaneously.

For each affected management host I used this sequence:

1. In the inner vCenter, place the host into maintenance mode. For this three-node nested vSAN lab I used the option that kept data accessible during the short maintenance window.
2. Wait for the powered-on VMs to migrate to the other hosts, then confirm the host is empty and fully in maintenance mode.
3. Leave the nested ESXi VM itself powered on so NSX can attempt a normal removal.
4. Only after evacuation is complete, move the host out of `vcf-mgmt-cl01` and place it directly under `vcf-mgmt-dc`.
5. In NSX Manager, find it under **System > Fabric > Hosts > Other Nodes**.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/22b-nsx-host-other-nodes-orphaned.png" alt="NSX Manager Other Nodes tab showing nested-esx02 as an orphaned host after it was moved out of the management cluster" caption="Once `nested-esx02` was outside `vcf-mgmt-cl01`, NSX listed it under Other Nodes as Orphaned. That confirmed the cluster Transport Node Profile was no longer controlling the host." width="1000px" height="auto" variant="technical" >}}

6. Attempt **Remove NSX** normally.
7. If the record is orphaned and normal removal cannot complete, use **Force Delete** only after confirming the state belongs to that host.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/23-remove-nsx-dialog.png" alt="NSX Manager Remove NSX dialog for nested-esx02 with the Force Delete option visible" caption="I attempted a normal NSX removal first. Force Delete was reserved for the orphaned host-specific record." width="760px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/23b-nsx-removal-progress.png" alt="NSX Manager uninstallation progress while removing NSX components from nested-esx02" caption="NSX began removing the host's switch configuration, controller status, network folders, and NSX components. I let this workflow finish before checking for any local state that remained on the host." width="620px" height="auto" variant="technical" >}}

8. Where the UI still could not remove the stale local state, stop the proxy and run the local cleanup:

   ```shell
   /etc/init.d/nsx-proxy stop
   nsxcli -c del nsx
   ```

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/26-local-nsx-cleanup.png" alt="ESXi shell running nsxcli local NSX removal after prechecks" caption="One host required local `nsxcli -c del nsx` cleanup after the stale registration prevented UI removal." width="850px" height="auto" variant="technical" >}}

9. Reboot the nested ESXi VM while it is still outside the cluster and still in maintenance mode.
10. Verify the host returns without the stale manager registration.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/23c-nsx-host-not-configured.png" alt="NSX Manager Other Nodes tab showing nested-esx02 with an NSX Configuration status of Not Configured" caption="After removal, `nested-esx02` remained under Other Nodes but now showed Not Configured instead of Orphaned. That was the clean state I wanted before returning it to the cluster." width="1000px" height="auto" variant="technical" >}}

11. Move it back into `vcf-mgmt-cl01`.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/24-moving-host-back-into-cluster.png" alt="vSphere dialog moving the cleaned nested ESXi host back into vcf-mgmt-cl01" caption="After reboot and verification outside the cluster, I returned the host to the management cluster so the Transport Node Profile could prepare it again." width="760px" height="auto" variant="technical" >}}

12. In NSX Manager, return to **System > Fabric > Hosts > Clusters**. Open the three-dot menu for `vcf-mgmt-cl01`, select **Configure NSX**, and let the cluster Transport Node Profile prepare the returned host again.

13. Wait for configuration to reach **Success**, the host to show **Up**, and manager/controller connectivity to return.

14. Exit maintenance mode only after those checks pass.

The final CLI checks showed the manager and controller connected to `192.168.88.61`:

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/27-nsx-manager-and-controller-connected.png" alt="ESXi NSX CLI showing connected manager and controller sessions to 192.168.88.61" caption="Both manager and controller connectivity were restored before the Installer retry." width="760px" height="auto" variant="technical" >}}

15. Move to the next affected host only after the first is healthy.

Moving the host out of the cluster was the key control-plane step. While it remained in the cluster, the Transport Node Profile controlled its NSX state and **Remove NSX** was disabled. The reboot cleared the old local agent identity so the host could register cleanly when it rejoined.

### Clearing the Remaining Degraded NSX Proxy Agent

Getting the host back to **NSX Configuration: Success** did not immediately make every health indicator green. `nested-esx01` had working TEP addresses and connected manager/controller sessions, but its Agent Status panel still showed `16 UP`, `0 DOWN`, and `1 DEGRADED`. The remaining degraded agent was `NSX_PROXY`.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/27b-nsx-proxy-agent-degraded.png" alt="NSX Agent Status panel showing 16 agents up and NSX_PROXY as the single degraded agent" caption="The transport-node configuration had succeeded, but `NSX_PROXY` was still the one degraded agent." width="500px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/27c-nsx-host-degraded-after-recovery.png" alt="NSX Hosts page showing nested-esx01 configured successfully but degraded while nested-esx02 and nested-esx03 are up" caption="At the cluster level, all three hosts showed NSX configuration Success, but host 1 remained Degraded while its proxy health converged." width="1000px" height="auto" variant="technical" >}}

This was a different condition from the original orphaned transport node. I did not remove NSX again. The remaining work was to repair the host certificate registration and restart the proxy once.

First, I retrieved the authoritative API thumbprint from the NSX Manager CLI:

```text
get certificate api thumbprint
```

The format mattered. My earlier OpenSSL-style, colon-separated value produced server errors. I used the exact colonless thumbprint printed by NSX Manager. From the NSX CLI on `nested-esx01`, I pushed the host certificate and synchronized the APH certificates:

```text
push host-certificate 192.168.88.61:443 \
  username admin \
  thumbprint <NSX_MANAGER_API_THUMBPRINT> \
  password <NSX_ADMIN_PASSWORD>

sync-aph-certificates 192.168.88.61:443 \
  username admin \
  thumbprint <NSX_MANAGER_API_THUMBPRINT> \
  password <NSX_ADMIN_PASSWORD>
```

Both commands reported success. I then exited the NSX CLI and restarted the host proxy once from the ESXi shell:

```shell
/etc/init.d/nsx-proxy restart
```

I verified the live state instead of repeatedly restarting it:

```shell
nsxcli -c get managers
nsxcli -c get controllers

grep -Ei 'nsx-proxy.*(error|warning)|certificate|unknown ca' \
  /var/log/nsx-syslog.log | tail -n 40
```

The useful evidence was now present: manager port `1234` was connected, controller port `1235` was connected, both certificates validated, and the controller session was up. The NSX UI briefly continued to report Degraded because host-agent health reporting lagged behind the successful proxy restart.

I considered **Sync Transport Node**, but it was disabled because the host was already **Success/Prepared**. That was a clue to stop changing configuration. I left the host alone, allowed the health cycle to update, and refreshed NSX Manager. The stale Degraded state cleared without another cleanup, Configure NSX operation, or proxy restart.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/27d-all-nsx-hosts-up.png" alt="NSX Hosts page showing vcf-mgmt-cl01 prepared with all three nested ESXi hosts configured successfully and up" caption="The final NSX state before retrying the Installer: the cluster was Prepared and all three transport nodes were Success and Up." width="1000px" height="auto" variant="technical" >}}

After both affected hosts were healthy, I selected **Retry and Proceed with Deployment**. The Installer passed Create Transport Node Collection, finished NSX at `94/94`, and moved into the management services.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/28b-nsx-94-of-94-complete.png" alt="VCF Installer showing the Deploy and configure NSX stage complete at 94 of 94 tasks and the VCF Management Platform stage in progress" caption="The retry cleared the original blocker, completed all 94 NSX tasks, and advanced into deployment of the VCF Management Platform." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/29-management-services-runtime-vms.png" alt="vSphere inventory showing bootstrap and VCF Management Services Runtime virtual machines" caption="The deployment then created the Management Services Runtime nodes in the background." width="560px" height="auto" variant="technical" >}}

## Fixing the VCF Automation Deployment

By the next morning, vSphere, NSX, the VCF Management Platform, VCF Operations, and Management Services had completed. VCF Automation was the last milestone. It also produced two different blockers.

### Blocker One: The Nested Hosts Were Too Small

I initially gave each nested management host 32 vCPUs and 112 GB of memory. That exposed 96 virtual CPUs on a physical server with 16 cores and 32 logical processors, creating heavy contention. I reduced all three hosts to 16 vCPUs, but overlooked VCF Automation's requirement for a 24-vCPU runtime VM.

When that VM was created but would not power on, I first ruled out HA. A compute-only migration compatibility check then identified the real problem: every nested host exposed only 16 CPUs, so none could run the 24-vCPU VM.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/30-automation-24-vcpu-compatibility-error.png" alt="vSphere migration compatibility check showing the VCF Automation VM requires 24 CPUs while the host provides 16" caption="The compatibility wizard separated the real 24-vCPU sizing problem from the earlier HA suspicion." width="900px" height="auto" variant="technical" >}}

I started by resizing `nested-esx01`, giving Fleet a compatible host on which to continue the deployment:

1. In the inner vCenter, put `nested-esx01` into maintenance mode.
2. Wait for active migrations to finish and confirm no powered-on VMs remained there.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/30b-nested-esx01-maintenance-mode-migrations.png" alt="Inner vCenter showing nested-esx01 in maintenance mode while its remaining virtual machines migrate to other hosts" caption="I placed `nested-esx01` into maintenance mode and waited for DRS to evacuate its powered-on workloads before changing the outer VM." width="1000px" height="auto" variant="technical" >}}

3. In the outer physical vCenter, power off the `nested-esx01` VM.
4. Change it from 16 to 24 vCPUs. It remained at 112 GB of memory.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/31-resizing-nested-esxi-to-24-vcpu.png" alt="Outer vCenter Edit Settings dialog showing nested-esx01 configured with 24 vCPUs and 112 GB of memory" caption="With the nested host powered off, I increased it to 24 vCPUs while leaving its memory at 112 GB." width="620px" height="auto" variant="technical" >}}

5. Power the nested host back on.
6. Confirm it reconnected to the inner vCenter with 24 logical CPUs.
7. Exit maintenance mode.
8. Let Fleet continue its Automation workflow.

Before Automation finally succeeded, I repeated the maintenance-mode, power-off, resize, and reconnect process for `nested-esx02` and `nested-esx03`. The final management cluster was uniform again, with all three hosts at 24 vCPUs and 112 GB of memory. That gave DRS and HA a compatible destination for the 24-vCPU Automation VM on every host instead of making `nested-esx01` its only possible placement.

This was still a lab compromise. Raising all three hosts to 24 vCPUs improved placement flexibility, but the physical host remained heavily CPU-overcommitted. The change solved VM compatibility and removed one more avoidable source of Automation failure; it did not create new physical compute, and it helped explain why the remaining deployment progressed slowly.

### Blocker Two: A Stale Services Runtime and an Overlapping Address

My JSON reserved `192.168.88.224-192.168.88.228` for the Automation runtime nodes, but `vcf-asr01.vcf.lab.devynharrington.com` also resolved to `.224`. The platform address therefore overlapped the first address in its own runtime pool. I corrected the DNS record to `.223`, but the failed deployment had already left stale lifecycle state behind. The Installer surfaced the same class of partial-allocation failure described in [Broadcom KB 450292](https://knowledge.broadcom.com/external/article/450292/vcf-91-deployment-fails-at-deploy-and-co.html).

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/32-automation-component-installation-failure.png" alt="VCF Operations lifecycle view showing the failed VCF Automation component installation" caption="The original Automation task had failed and retained its stale runtime inputs." width="1000px" height="auto" variant="technical" >}}

After the failure, I manually deleted the partial `vcf-asr01-*` VM from vCenter, but the next attempt inherited the runtime object and allocation state retained by Fleet and SDDC Manager. Deleting the VM was not the same as removing it from VCF's lifecycle inventory; the cleanup tool later found the stale VSP cluster record even though the VM was already gone.

I moved `vcf-asr01.vcf.lab.devynharrington.com` to `192.168.88.223`, outside the final `.224-.228` runtime pool. DNS alone was not enough because Fleet and SDDC Manager still held a stale VSP cluster record.

Broadcom's [scripted component cleanup guidance in KB 441333](https://knowledge.broadcom.com/external/article/441333/scripted-components-cleanup-from-vcf-ope.html) provided the cleanup mechanism. There is also a supported option to [skip VCF Automation during initial deployment and add it later](https://knowledge.broadcom.com/external/article/441816/availability-of-the-option-to-skip-vcf-a.html), but I ultimately completed it in the original Installer workflow.

From `sddcm01` as root, I first listed the stale runtime. The real ID must be discovered and verified in the environment, not copied from an example:

```bash
cd /home/vcf

python3 cleanup_component.py list vsp-cluster \
  --fleet-fqdn vcf-flt01.vcf.lab.devynharrington.com \
  --vcf-services-runtime-fqdn vcf-msr01.vcf.lab.devynharrington.com \
  --vcf-services-runtime-username admin@vsp.local
```

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/33-listing-stale-vsp-runtime.png" alt="SDDC Manager cleanup script listing the stale VCF Automation services runtime" caption="The list operation identified the stale runtime and its environment-specific component ID before any deletion." width="900px" height="auto" variant="technical" >}}

After confirming the ID and FQDN, I deleted that one stale VSP cluster record:

```bash
python3 cleanup_component.py delete vsp-cluster \
  --component-id <STALE_VSP_CLUSTER_ID> \
  --fleet-fqdn vcf-flt01.vcf.lab.devynharrington.com \
  --vcf-services-runtime-fqdn vcf-msr01.vcf.lab.devynharrington.com \
  --vcf-services-runtime-username admin@vsp.local \
  --vcenter-username administrator@vsphere.local
```

I did not add a force flag. The script authenticated to Fleet and vCenter, described what it intended to remove, and handled the already-missing partial VM while deleting the stale Fleet and platform-database records.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/34-deleting-stale-vsp-runtime.png" alt="SDDC Manager cleanup script deleting the verified stale VCF Automation services runtime" caption="The cleanup targeted only the verified stale services-runtime record." width="900px" height="auto" variant="technical" >}}

I then reran the list operation and received **No available components for deletion**.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/35-stale-vsp-runtime-removed.png" alt="VCF component cleanup script reporting no stale VSP cluster available for deletion" caption="A second list confirmed that no stale VSP cluster remained." width="850px" height="auto" variant="technical" >}}

Before retrying, I verified the exact state I wanted:

```bash
getent hosts vcf-asr01.vcf.lab.devynharrington.com

for ip in 192.168.88.{224..228}; do
  if ping -c 1 -W 1 "$ip" >/dev/null 2>&1; then
    echo "$ip IN USE"
  else
    echo "$ip FREE"
  fi
done
```

The runtime FQDN resolved to `.223`, all five pool addresses were free, no stale VSP cluster remained, no partial `vcf-asr01-*` VM remained, and the expected services-runtime template stayed in the `vcf-automation` folder.

This was the point at which I seriously considered tearing down the nested environment and rebuilding it from scratch on the same physical ESXi and vCenter foundation. Automation had become frustrating enough that starting over sounded easier. I decided against it because the environment underneath it was healthy, I had already worked through the much harder NSX recovery, and rebuilding would have meant risking that entire process again. I did not want to solve NSX, reach the last component, and quit. I kept troubleshooting the state that remained instead of discarding the progress I had already earned.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/36-automation-dns-and-pool-validation.png" alt="Terminal showing vcf-asr01 resolving to 192.168.88.223 and runtime pool addresses 224 through 228 free" caption="The clean retry state: a unique runtime FQDN outside the pool, with every pool address free." width="820px" height="auto" variant="technical" >}}

Only then did I click **Retry and Proceed with Deployment** once. That created a new Fleet lifecycle task instead of attempting to revive the stale one.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/36b-automation-failed-retry-and-proceed-cropped.png" alt="Focused VCF Installer view showing VCF Automation failed at two of eight tasks with the Retry and Proceed with Deployment button available" caption="After clearing the stale runtime state and correcting the address overlap, I used Retry and Proceed with Deployment to start a clean Automation attempt." width="850px" height="auto" variant="technical" >}}

## Monitoring VCF Automation Without Interrupting It

The fresh attempt stayed at the same percentage for a long time. Instead of assuming it was stuck, I checked Fleet and the component logs to see whether work was still moving.

From the VCF Installer, the lifecycle support script showed the current Fleet task status:

```bash
/home/vcf/lcm_service_support.sh \
  -u admin@vsp.local \
  -s vcf-msr01.vcf.lab.devynharrington.com \
  -t <FLEET_TASK_ID>
```

On a VCF Management Services Runtime control-plane node, I used the SDDC Build service logs:

```bash
export KUBECONFIG=/etc/kubernetes/admin.conf

POD=$(kubectl get pods -n vcf-sddc-lcm -o name \
  | grep 'vcf-sddc-build-service-sddcbuild' \
  | head -1)

echo "$POD"
```

For a short view:

```bash
kubectl logs -n vcf-sddc-lcm "$POD" --since=20m \
  | grep -Ei 'vcf-asr01|bootstrap|clone|deploy|configure|SUCCESSFUL|COMPLETED|FAILED|ERROR|exception|timeout' \
  | tail -20
```

For a live view:

```bash
kubectl logs -n vcf-sddc-lcm "$POD" -f --since=5m \
  | grep --line-buffered -Ei 'vcf-asr01|bootstrap|clone|deploy|configure|SUCCESSFUL|COMPLETED|FAILED|ERROR|exception|timeout'
```

The evidence was healthy even while the UI changed slowly. The support script called the task normal, timestamps advanced, a temporary bootstrap VM appeared, template cloning and power-on tasks completed, a permanent `vcf-asr01-*` VM appeared, CNS volumes were created and attached, and the workflow remained running with empty error arrays.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/37-automation-bootstrap-vm-created.png" alt="vSphere inventory showing the temporary VCF Automation bootstrap VM and services runtime template" caption="The temporary bootstrap VM was concrete evidence that the fresh Automation workflow had moved beyond prechecks." width="560px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/38-automation-bootstrap-progress.png" alt="vSphere inventory showing VCF Automation bootstrap activity continuing in the management domain" caption="Bootstrap, cloning, and runtime work continued even while the Installer percentage appeared unchanged." width="560px" height="auto" variant="technical" >}}

VCF Automation is resource-heavy, and the single physical MS-A2 was already contending for CPU and storage. I left the deployment untouched overnight rather than creating another competing retry.

## The Successful VCF 9.1 Management Domain

The next morning, the Installer showed VCF Automation, the last remaining component, complete at `7/7`. With that, the entire management-domain deployment was successful.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/39-vcf-9-1-deployment-complete.png" alt="VCF Installer landing page showing that the previous VCF 9.1 management-domain deployment completed successfully" caption="Back on the Installer landing page, the deployment card confirmed that the previous deployment completed successfully." width="1000px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/40-vcf-9-1-deployment-congratulations.png" alt="VCF Installer Congratulations screen showing the VCF 9.1 management-domain deployment completed successfully with all stages complete" caption="The final confirmation: VCF Automation reached 7/7 and the complete management-domain deployment succeeded." width="1000px" height="auto" variant="technical" >}}

## Opening VCF Operations

The **Operations UI** link on the completed deployment opened the VCF Operations login page. After signing in with the account created during bring-up, I landed on the VCF Overview dashboard with the management domain, vCenter, three hosts, datastores, distributed switch, and virtual-machine inventory already registered.

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/41-vcf-operations-login.png" alt="VMware Cloud Foundation Operations login page" caption="The Operations UI link led to the VCF Operations login page." width="760px" height="auto" variant="technical" >}}

{{< lab-product-image src="/images/vcf/vcf-9-1-nested-management-domain/42-vcf-operations-dashboard.png" alt="VMware Cloud Foundation Operations VCF Overview dashboard showing the newly deployed management-domain inventory" caption="After login, VCF Operations already showed the management domain and its vCenter, hosts, datastores, networking, and virtual-machine inventory." width="1000px" height="auto" variant="technical" >}}

## Scripts and Files Used

I kept the final deployment JSON as the known-good baseline for my VCF deployment.

You can download the current files from William Lam's [VCF Fleet Automated Lab Deployment repository](https://github.com/lamw/vcf-fleet-automated-lab-deployment):

- [`sample-william-vcf-9.1.0.ps1`](https://github.com/lamw/vcf-fleet-automated-lab-deployment/blob/master/sample-william-vcf-9.1.0.ps1): the configuration template I customized for my lab.
- [`vcf-automated-fleet-deployment.ps1`](https://github.com/lamw/vcf-fleet-automated-lab-deployment/blob/master/vcf-automated-fleet-deployment.ps1): the Fleet deployment script that reads that configuration.
- [`vcf-automated-wld-deployment.ps1`](https://github.com/lamw/vcf-fleet-automated-lab-deployment/blob/master/vcf-automated-wld-deployment.ps1): the workload-domain script I plan to use in the next article.

I kept the customized configuration, both scripts, the Nested ESXi OVA, and the VCF Installer OVA in one project folder. You can store them in different locations, but keeping everything together let me reuse the same base path and made validation and troubleshooting easier. Before sharing a customized configuration, remove all vCenter, ESXi, Installer, SDDC Manager, NSX, Operations, and Automation credentials.

I launched the management-domain workflow with:

```powershell
./vcf-automated-fleet-deployment.ps1 -EnvConfigFile ./my-vcf-9.1.0.ps1
```

That workflow created the nested hosts, deployed the VCF Installer, and generated the initial management-domain JSON. I will cover the workload-domain script only after I use it to commission `nested-esx04` through `nested-esx06` and validate the result.

## Lessons Learned

- Check forward and reverse DNS before deployment. If the Installer finds a duplicate or missing record, stop and fix it.
- Keep each service address outside the IP pool reserved for its runtime nodes.
- Size every nested management host for the largest VM the cluster may need to run. VCF Automation required 24 vCPUs, so I set all three hosts to 24 to give DRS and HA more than one compatible destination.
- If the percentage stops moving, do not immediately assume the deployment is stuck.
- Check Fleet, Kubernetes, vCenter tasks, and component logs to tell the difference between slow progress and stale work.
- Clean up stale lifecycle metadata before retrying a partially failed component.
- Recover one management host at a time, and make sure it is healthy before moving to the next.
- Save the successful deployment specification as a reference, and keep credentials and certificate thumbprints out of anything you share.

Getting the complete VCF 9.1 management domain running was easily the most satisfying milestone since I unpacked the MS-A2. Next, I will commission `nested-esx04` through `nested-esx06`, build the workload domain, and work toward enabling Supervisor and VKS.
