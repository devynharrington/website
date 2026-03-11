+++
title = "Deploying and Using the VMware Health and Security Toolkit (HST)"
date = "2026-03-10"
draft = false
description = "A complete walkthrough of deploying the VMware Health and Security Toolkit appliance and performing infrastructure health and security assessments."
tags = ["VMware", "Security", "VCF", "Infrastructure", "Assessment"]
categories = ["VCF"]

showDate = true
showReadingTime = true
showWordCount = false
showTableOfContents = true
+++

The VMware Health and Security Toolkit (HST) is a platform provided by Broadcom that helps administrators perform health checks, configuration validation, and security assessments across VMware infrastructure environments.

The tool collects configuration data from components such as:

- vCenter Server  
- ESXi Hosts  
- Virtual Machines  
- vSAN  
- NSX  
- SDDC Manager  

It then analyzes the collected data against security controls and best practices to identify potential risks or configuration issues.

This guide walks through the full process of deploying and using the HST appliance, including environment validation and reviewing generated security reports.

All screenshots used in this article have been sanitized to remove environment specific identifiers while preserving the functionality of the toolkit. Sensitive information such as IP addresses, hostnames, credentials, and infrastructure identifiers have been intentionally blurred.

---

# Downloading the HST Toolkit

The VMware Health and Security Toolkit can be downloaded from the Broadcom support portal.

https://www.broadcom.com/support/oem/vmware-health-security-toolkit

![HST Download Page](/images/vcf/hst-tool/1hstdownload.png)

Before downloading the toolkit you must accept the Broadcom license agreement.

![License Agreement](/images/vcf/hst-tool/2hstagreement.png)

---

# Deploying the HST Virtual Appliance

The toolkit is delivered as an OVA appliance and deployed through the Deploy OVF Template workflow in the vSphere Client.

## Deploy OVF Template

![Deploy OVF Template](/images/vcf/hst-tool/3deployovf.png)

Upload the downloaded OVA file.

![Upload OVA](/images/vcf/hst-tool/4uploadovf.png)

Once uploaded the appliance template appears in the deployment wizard.

![Uploaded Template](/images/vcf/hst-tool/5hstuploaded.png)

---

## Provide Name and Folder

Specify the virtual machine name and inventory location.

![Name and Folder](/images/vcf/hst-tool/6nameandfolder.png)

---

## Select Compute Resource

Choose the ESXi host or cluster where the appliance will run.

![Compute Resource](/images/vcf/hst-tool/7hstcomputerresource.png)

---

## Review Deployment Details

Verify the OVF template information.

![Review Details](/images/vcf/hst-tool/8hstreviewdetails.png)

---

## Select Storage

Choose the datastore where the appliance disks will reside.

![Select Storage](/images/vcf/hst-tool/9hststorage.png)

---

## Configure Networking

Select the network that will provide connectivity to the environment.

![Network Configuration](/images/vcf/hst-tool/10hstnetwork.png)

---

# DNS Requirement

Before powering on the appliance it is recommended to create a DNS record for the HST virtual machine.

The toolkit is accessed through a web interface and using DNS allows administrators to access the system using a hostname instead of an IP address.

Requirements:

• Allocate **1 IP address** for the HST appliance  
• Create a **DNS A record** for the hostname  
• Ensure forward DNS resolution is working  

Example:

Hostname  
hst.domain.local

IP Address  
10.10.10.50

Once the appliance is powered on you can navigate to the toolkit in a browser using the hostname.

Example:

https://hst.domain.local

---

## Customize Template

Configure credentials and networking parameters.

![Customize Template](/images/vcf/hst-tool/11hstcustomizetemplate.png)

---

## Complete Deployment

Review the summary and finish the deployment.

![Deployment Summary](/images/vcf/hst-tool/12hstfinish.png)

---

# Powering On the Appliance

Once deployment finishes power on the appliance.

![Power On Appliance](/images/vcf/hst-tool/14poweron.png)

---

# Initial Login and License Agreement

After the appliance has powered on and finished booting, open a web browser and navigate to the hostname that was created in DNS for the HST appliance.

For example, using the DNS entry created earlier:

https://hst.domain.local

Accessing the toolkit using the hostname ensures proper DNS resolution and allows administrators to consistently reach the system without relying on direct IP addresses.

When navigating to the URL for the first time, the Health and Security Toolkit login interface will appear.

![License Agreement](/images/vcf/hst-tool/15hstagreement2.png)

Before using the platform, the Broadcom license agreement must be accepted. Once accepted, you can proceed with authentication and complete the offline login process.

---

# Offline Login and Registration

HST supports offline login which is common in isolated or restricted environments such as federal or air gapped infrastructure.

![Offline Login](/images/vcf/hst-tool/16hstofflinelogin.png)

![Offline Login Step](/images/vcf/hst-tool/17hstofflinelogin2.png)

![Offline Login Step](/images/vcf/hst-tool/18hstofflinelogin3.png)

![Offline Login Step](/images/vcf/hst-tool/19hstofflinelogin4.png)

To obtain the required registration key navigate to the Broadcom Professional Services Tool Hub.

https://pstoolhub.broadcom.com/#/login

After authentication request an activation key for the Health and Security Toolkit. The key will be delivered to your email address.

![Registration Key](/images/vcf/hst-tool/20hstregistrationkey.png)

---

# Completing Authentication

Continue through the offline login process.

![Offline Login Step](/images/vcf/hst-tool/22hstofflinelogin6.png)

Once authentication is successful the HST dashboard becomes available.

![Login Successful](/images/vcf/hst-tool/23hstloginsuccessful.png)

---

# Creating an Assessment Project

Projects are used to organize health and security assessments.

## Create Folder

![Create Folder](/images/vcf/hst-tool/24hstnewfolder.png)

---

## Configure Project Details

![Project Details](/images/vcf/hst-tool/26hstprojectdetails.png)

---

# Validating Infrastructure Targets

The toolkit validates connectivity to infrastructure components before the assessment can begin.

![Validation Step](/images/vcf/hst-tool/27hstvalidate.png)

When configuring validation settings the Host field should contain the **FQDN of the vCenter Server** not the ESXi host.

Even though the field is labeled Host the toolkit connects through **vCenter Server APIs** to collect configuration data from the environment.

Correct example

vcenter.domain.local

Incorrect example

esxi01.domain.local

![Validation Results](/images/vcf/hst-tool/28hstvalidate2.png)

Example validation for NSX.

![NSX Validation](/images/vcf/hst-tool/29hstnsxvalidate.png)

When validating the NSX environment the toolkit requires the **NSX Manager Cluster VIP**.

To locate the NSX VIP

1 Log into the NSX Manager UI  
2 Navigate to **System**  
3 Select **Appliances**  
4 Locate the **Cluster VIP**  
5 Copy the value and paste it into the validation field  

Validation for SDDC Manager.

![SDDC Manager Validation](/images/vcf/hst-tool/30hstsddcvalidate.png)

---

# Running the Assessment

Submit the project to begin data collection.

![Submit Assessment](/images/vcf/hst-tool/31hstsubmission.png)

Submission begins.

![Submission Complete](/images/vcf/hst-tool/32submissiondone.png)

The toolkit begins collecting infrastructure data.

![Collecting Data](/images/vcf/hst-tool/33submittedandcollecting.png)

When finished the results dashboard becomes available.

![Results Page](/images/vcf/hst-tool/34hstresults.png)

---

# Reviewing Assessment Results

## Health Analyzer

![Health Analyzer](/images/vcf/hst-tool/35healthanalyzer.png)

Administrators can download the **Health Check Word report** which contains

Executive Summary  
Health Check Background  
Major Findings and Recommendations  
Health Check Assessment Results  
Appendices and inventory  

---

## Security Assessment

![Security Assessment](/images/vcf/hst-tool/36securityassessment.png)

The Security Assessment module evaluates infrastructure configurations against security best practices and generates detailed findings across multiple VMware platforms.

Access to the Security Assessment module is controlled through Broadcom internal access groups. Users must be added to the appropriate group before they can request activation keys or use the module.

For this reason the toolkit is most commonly used by **Broadcom Professional Services teams** who can obtain the necessary access through the proper internal channels.

---

# Generated Reports

## Executive Report

![Executive Report](/images/vcf/hst-tool/37executivereport.png)

---

## Administrative Report

The Administrative Report for the Security Assessment module is downloaded as an HTML file.

When opened, the report loads directly in a web browser and provides a structured and easy to navigate view of the assessment findings. This format allows administrators to review results, drill into individual controls, and reference remediation guidance without needing additional software.

![Admin Report](/images/vcf/hst-tool/38adminreport.png)

To demonstrate how these reports render in a browser, the following example administrative reports from a sandbox lab environment are provided below. These reports were generated during testing in July 2025 using HST version 1.0 and are included strictly as non production examples.

👉 [Download the vCenter Administrative Report (Example Lab Report)](/downloads/vcenter-admin-report.html)

👉 [Download the NSX Administrative Report (Example Lab Report)](/downloads/nsx-admin-report.html)

👉 [Download the SDDC Manager Administrative Report (Example Lab Report)](/downloads/sddc-admin-report.html)

---

# Conclusion

The VMware Health and Security Toolkit provides administrators with a powerful method for evaluating the health and security posture of VMware infrastructure environments.

By automating configuration validation across vCenter ESXi NSX vSAN and SDDC Manager administrators can quickly identify configuration issues and security risks while receiving actionable remediation guidance.

---

## References

Broadcom. (n.d.). *VMware Health and Security Toolkit*.  
https://www.broadcom.com/support/oem/vmware-health-security-toolkit

Broadcom. (n.d.). *Professional Services Tool Hub*.  
https://pstoolhub.broadcom.com/#/login

National Institute of Standards and Technology. (2018).  
*Framework for Improving Critical Infrastructure Cybersecurity (Version 1.1).*  
https://www.nist.gov/cyberframework

National Institute of Standards and Technology. (2020).  
*Security and Privacy Controls for Information Systems and Organizations (SP 800-53 Rev. 5).*  
https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final

VMware. (n.d.). *Security Hardening Guides.*  
https://www.vmware.com/resources/hardening-guides