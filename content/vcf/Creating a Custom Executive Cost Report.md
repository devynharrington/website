+++
title = "Building an Executive Cost Dashboard in VCF Operations"
date = "2026-03-03"
draft = false
description = "A structured walkthrough of creating a reusable VM cost view, executive dashboard, and exportable financial report inside VCF Operations."
tags = ["VCF", "Cost Governance", "Operations", "VMware"]
categories = ["VCF"]

showDate = true
showReadingTime = true
showWordCount = false
showTableOfContents = true
+++

## Creating a Custom Executive Cost View in VCF Operations

Before building any meaningful dashboard in VCF Operations, it is critical to establish a structured data foundation. Dashboards are only as effective as the views that power them. Rather than relying on default widgets, this implementation begins by creating a reusable cost-focused List View that surfaces VM-level financial metrics in a structured and executive-ready format.

This custom view will:

• Display month-to-date spend  
• Project monthly cost  
• Show daily burn rate  
• Surface effective daily CPU, memory, and storage usage  
• Provide an aggregated summary total

All screenshots in this article have been sanitized to remove environment-specific identifiers. Hostnames, cluster names, domain paths, and organizational labels have been blurred or replaced with generic identifiers to protect operational data.

---

**Step 1 — Navigate to Views**

From the VCF Operations interface:

Infrastructure Operations  
→ Dashboards and Reports  
→ Views  
→ Create

![Navigating to the Views configuration area within VCF Operations.](/images/vcf/executive-cost-dashboard/screenshot01.png)

*Navigating to the Views configuration area within VCF Operations.*

---

**Step 2 — Select the List View Type**

When prompted to select a view type, choose:

List

A List View allows cost metrics to be presented in a structured tabular format, making it ideal for executive reporting and dashboard integration.

![Selecting List as the view type for structured cost reporting.](/images/vcf/executive-cost-dashboard/screenshot02.png)

*Selecting List as the view type for structured cost reporting.*

---

**Step 3 — Configure the View Name**

Within the **Name & Configuration** screen, provide a descriptive name for the view.

Name: Executive VM Cost Detail

Optionally add a description explaining the purpose of the view.

This name will appear when selecting the view in dashboards, reports, and list widgets.

![Defining the view name for the custom cost view.](/images/vcf/executive-cost-dashboard/screenshot03.png)

*Defining the view name during the view creation process.*

---

**Step 4 — Configure the Data Tab**

Click **Next** to move to the **Data** tab.

Under **Add Subject**, select:

Virtual Machine

The Subject defines which object type the metrics apply to. Because cost modeling is calculated at the VM level, selecting **Virtual Machine** ensures that financial metrics aggregate correctly and support VM-level drilldown.

Next, open the **Metrics** selector and add the following cost metrics:

• MTD Total Cost  
• Monthly Projected Total Cost  
• Effective Daily Total Cost

Then add supporting resource usage metrics:

• Effective Daily CPU Usage  
• Effective Daily Memory Usage  
• Effective Daily Storage Usage

The cost metrics provide financial visibility while the usage metrics add operational context.

![Selecting cost and usage metrics from the metric picker.](/images/vcf/executive-cost-dashboard/screenshot05.5.png)

*Selecting cost and usage metrics from the metric picker.*

---

**Step 5 — Configure Metric Transformations**

Each metric must be configured intentionally to ensure the view produces accurate financial reporting.

For the cost metrics:

MTD Total Cost  
Monthly Projected Total Cost  
Effective Daily Total Cost

Configure the following settings:

Units  
Use adapter-defined currency formatting.

Sort Order  
Descending

This ensures the highest cost virtual machines appear first.

First Transformation  
Last

Second Transformation  
Absolute Timestamp

These transformations ensure the most recent calculated value is displayed while preserving the correct reporting timestamp.

![Example metric configuration showing units, sorting, and transformation logic applied to a cost metric.](/images/vcf/executive-cost-dashboard/screenshot06.png)

*Example metric configuration showing units, sorting, and transformation logic applied to a cost metric.*

---

**Step 6 — Configure Usage Metrics**

For the usage metrics:

Effective Daily CPU Usage  
Effective Daily Memory Usage  
Effective Daily Storage Usage

Apply the following settings:

Units  
Auto

Sort Order  
None

These metrics provide context and should not override cost-based ranking.

First Transformation  
Last

Second Transformation  
Absolute Timestamp

---

**Step 7 — Arrange Metric Order**

Reorder the metrics in the Data panel so financial visibility is prioritized:

MTD Total Cost  
Monthly Projected Total Cost  
Effective Daily Total Cost  
Effective Daily CPU Usage  
Effective Daily Memory Usage  
Effective Daily Storage Usage

This ordering ensures financial metrics remain the primary focus while resource metrics provide supporting context.

![Finalized metric configuration within the Data panel.](/images/vcf/executive-cost-dashboard/screenshot07.png)

*Finalized metric configuration within the Data panel.*

---

**Step 8 — Leave Time Settings and Filter as Default**

After completing the metric configuration in the **Data** tab, click **Next** to proceed through the remaining configuration screens.

The next two sections in the view configuration wizard are:

Time Settings  
Filter

For this implementation, both of these sections can be left at their **default configuration**.

Time Settings determines how data is evaluated across time windows. Because the metrics already use the **Last transformation with Absolute Timestamp**, the default settings correctly display the most recent calculated value.

The Filter section allows administrators to restrict which objects appear in the view. Since this view is intended to support dashboards and reporting across the environment, leaving the filter unset ensures the view evaluates all virtual machines within the selected scope.

Click **Next** through both sections to proceed to the **Summary** tab.

---

**Step 9 — Configure the Summary Tab**

After completing the Data configuration, navigate to the **Summary** tab.

Click **Add Summary** to create an aggregated row at the bottom of the list view.

Set the aggregation type to:

Sum

This configuration instructs VCF Operations to calculate the cumulative total for each financial metric displayed in the view.

Because the cost metrics represent monetary values, using **Sum** provides leadership with an immediate understanding of the **total cost footprint across all virtual machines** in scope.

![Opening the Summary tab and adding a summary aggregation.](/images/vcf/executive-cost-dashboard/screenshot11.png)

*Configuring the Summary tab to generate aggregated totals across all VM cost metrics.*

The summary row becomes especially valuable when the view is embedded inside dashboards or exported into reports.

---

**Step 10 — Configure Preview Source**

Before saving the view, validate the data output using the **Preview Source** feature.

On the right side of the page, locate the dropdown next to **Preview Source** and click:

Select Preview Source

![Opening the Preview Source selector.](/images/vcf/executive-cost-dashboard/screenshot10.png)

*Selecting the Preview Source dropdown to choose an object for validating the view output.*

Next, select an object that contains virtual machines such as a **cluster** or **VCF instance**.

![Selecting an object to preview the VM cost view output.](/images/vcf/executive-cost-dashboard/screenshot08.png)

*Selecting a preview object to validate the VM-level cost metrics.*

Once selected, the preview pane populates with live data and confirms that:

• Cost metrics populate correctly  
• Sorting is applied correctly  
• Transformations display the latest calculated values  
• The summary aggregation appears at the bottom of the view

Previewing the data ensures the view behaves correctly before saving and embedding it into dashboards.

---

**Result**

At this stage, you have created a reusable cost-focused **List View** that:

• Surfaces VM-level financial metrics  
• Applies consistent transformation logic  
• Sorts by highest spend first  
• Includes an aggregated summary row  
• Provides contextual resource usage metrics  

When a preview object is selected, the view displays VM-level cost data along with the aggregated totals at the bottom of the table.

![Completed Executive VM Cost Detail view displaying VM-level cost metrics and summary totals.](/images/vcf/executive-cost-dashboard/screenshot12.5.png)

*Example output of the Executive VM Cost Detail view after selecting a preview object.*

This view now serves as the **data foundation** for building an executive cost dashboard in VCF Operations.

---

## Building the Executive Cost Dashboard — Scoreboard Layer

(Everything below this section remains exactly the same except the Step headings are bold instead of headings.)

**Step 1 — Create a New Dashboard**

Navigate to:

Infrastructure Operations  
→ Dashboards  
→ Create

Assign a meaningful name such as:

Executive Cost Dashboard

This dashboard will aggregate cost visibility across selected clusters.

![Creating a new dashboard for executive cost visibility.](/images/vcf/executive-cost-dashboard/screenshot13.png)

---

**Step 2 — Open the Dashboard Canvas**

After creating the dashboard, the blank dashboard canvas will appear.

This is where widgets will be added to build the executive cost view.

![Blank dashboard canvas after creating the new dashboard.](/images/vcf/executive-cost-dashboard/screenshot14.png)

---

**Step 3 — Add the Scoreboard Widget**

From the widget library, drag the **Scoreboard** widget onto the canvas.

Position it at the top and expand it to full width.

![Adding the Scoreboard widget to the dashboard canvas.](/images/vcf/executive-cost-dashboard/screenshot14.5.png)

---

**Step 4 — Enable Self Provider and Display Object Name**

Click the **pencil icon** on the Scoreboard widget to open the widget configuration panel.

Enable:

Self Provider → On

Select:

Show → Object Name

![Opening the Scoreboard widget configuration panel and enabling Self Provider.](/images/vcf/executive-cost-dashboard/screenshot15.png)

---

**Step 5 — Add Cluster Cost Metrics**

Under **Input Data**, select:

Metrics → Add

Filter:

cluster compute

Choose:

• Monthly Cluster Total Cost  
• Aggregated Daily Total Cost

Repeat for both clusters.

![Selecting cluster-level cost metrics for the scoreboard.](/images/vcf/executive-cost-dashboard/screenshot16.png)

---

**Step 6 — Rename Box Labels for Executive Clarity**

Rename tiles:

• Mgmt – Monthly Spend  
• Mgmt – Daily Burn  
• Workload – Monthly Spend  
• Workload – Daily Burn

![Renaming scoreboard labels for executive clarity.](/images/vcf/executive-cost-dashboard/screenshot17.png)

---

**Step 7 — Validate Scoreboard Layout**

Verify:

• Total Monthly Spend – MGMT  
• Daily Burn Rate – MGMT  
• Total Monthly Spend – WLD1  
• Daily Burn Rate – WLD1  

![Finalized scoreboard layout displaying domain level cost metrics.](/images/vcf/executive-cost-dashboard/screenshot18.png)

---

## Adding Cost Trend Intelligence

(The rest of the article continues the same pattern. Only the Step headings are bold instead of # headings.)

**Step 1 — Add the Metric Chart Widget**

From the widget library, drag the Metric Chart widget onto the dashboard canvas.

![Metric Chart widget added to the dashboard before configuration.](/images/vcf/executive-cost-dashboard/screenshot19.png)

---

**Step 2 — Enter Edit Mode and Select Self Provider**

Click the pencil icon.

![Opening the Metric Chart configuration panel via the pencil icon.](/images/vcf/executive-cost-dashboard/screenshot20.png)

Enable:

Self Provider → On

---

**Step 3 — Add Cluster-Level Cost Metrics**

Under Input Data:

Add:

Monthly Cluster Total Cost for both clusters.

![Input Data configuration.](/images/vcf/executive-cost-dashboard/screenshot21.5.png)

---

**Step 4 — Show the Toolbar to Access Chart Controls**

Enable:

Show Toolbar

![Enabling the chart toolbar.](/images/vcf/executive-cost-dashboard/screenshot24.5.png)

---

**Step 5 — Configure the Time Range**

Set:

Last 6 Months

![Configuring the chart to display the last six months of cost data.](/images/vcf/executive-cost-dashboard/screenshot25.5.png)

---

**Step 6 — Configure Split Chart or Combined View**

Combined chart is recommended.

![Finalized cost trend visualization.](/images/vcf/executive-cost-dashboard/screenshot30.png)

---

## Adding Detailed Cost Breakdown with the Custom View

**Step 1 — Add the List View Widget**

Drag List View widget.

![Adding the List View widget to the dashboard canvas.](/images/vcf/executive-cost-dashboard/screenshot31.png)

---

**Step 2 — Enable Self Provider**

Self Provider → On

![Enabling Self Provider for the List View widget.](/images/vcf/executive-cost-dashboard/screenshot33.png)

---

**Step 3 — Configure Input Data**

Select:

VCF Instance

![Selecting the VCF Instance as the object source.](/images/vcf/executive-cost-dashboard/screenshot35.png)

---

**Step 4 — Configure Output Data**

Select:

Executive VM Cost Detail

![Selecting the custom Executive VM Cost Detail view.](/images/vcf/executive-cost-dashboard/screenshot32.png)

---

**Step 5 — Save and Validate**

The List View now renders VM-level cost details.

![Finalized List View displaying VM-level cost breakdown.](/images/vcf/executive-cost-dashboard/screenshot36.5.png)

---

## Creating and Running the Executive Cost Report

**Step 1 — Navigate to Reports**

Infrastructure Operations  
→ Dashboards and Reports  
→ Reports  
→ Create

![Navigating to the Reports section.](/images/vcf/executive-cost-dashboard/screenshot37.png)

---

**Step 2 — Create the Report Template**

Name:

Executive Cost Report

---

**Step 3 — Add the Executive Dashboard**

Drag the dashboard into the report layout.

![Searching for and dragging the Executive Cost Dashboard.](/images/vcf/executive-cost-dashboard/screenshot39.png)

---

**Step 4 — Add the Custom Cost View**

Drag:

Executive VM Cost Detail

![Dragging the custom Executive VM Cost Detail view.](/images/vcf/executive-cost-dashboard/screenshot40.png)

---

**Step 5 — Run the Report Template**

Select:

Run

![Newly created Executive Cost Report template.](/images/vcf/executive-cost-dashboard/screenshot42.png)

---

**Step 6 — Select the Object Scope**

Select:

VCF Instance

![Selecting the VCF Instance as the object scope.](/images/vcf/executive-cost-dashboard/screenshot44.png)

---

**Step 7 — Access Generated Reports**

Click the numeric link.

![Viewing generated report instances.](/images/vcf/executive-cost-dashboard/screenshot46.png)

---

**Step 8 — Export as PDF or Excel**

Export options:

• PDF  
• Excel

![Executive Cost Report rendered in PDF format.](/images/vcf/executive-cost-dashboard/screenshot47.png)

---

End Result

You have now built a complete cost governance workflow inside VCF Operations.