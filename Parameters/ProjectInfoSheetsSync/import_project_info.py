# -*- coding: utf-8 -*-
"""
Revit Dynamo Python Script
Title: Import Project Information from Google Sheets
Description: Reads audit project parameters from a Google Sheet (CSV API), checks that the
             Project Information GUID matches to prevent cross-project corruption, and imports values.
Author: Julian Mejia
Date: June 2026
Revit Compatibility: 2020 - 2025+
"""

import clr
import urllib.request
import urllib.parse
import csv
import io
import traceback

# Import RevitServices
clr.AddReference('RevitServices')
import RevitServices
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

# Import RevitAPI
clr.AddReference('RevitAPI')
from Autodesk.Revit.DB import *

doc = DocumentManager.Instance.CurrentDBDocument

try:
    # --- INPUTS ---
    # IN[0]: Google Spreadsheet URL
    url_input = str(IN[0]).strip()
    file_name = doc.Title

    # 1. Reconstruct the sheet tab name (matches export structure)
    try:
        parts = file_name.split('-')
        discipline = parts[4] if len(parts) > 4 else "GEN"
        suffix = file_name.split('_')[-1].replace('.rvt', '').replace('.RVT', '').upper()
        sheet_name = "{}_INFO_{}".format(discipline, suffix)[:31]
    except:
        sheet_name = "Sheet 1" # Fallback

    # 2. Query endpoint to download Sheet as CSV
    base_url = url_input.split('/edit')[0]
    url_csv = base_url + "/gviz/tq?tqx=out:csv&sheet=" + urllib.parse.quote(sheet_name)

    req = urllib.request.Request(url_csv)
    with urllib.request.urlopen(req) as response:
        content = response.read().decode('utf-8')

    # Security check: If response is HTML, it means the spreadsheet is not public/shared
    if "<html" in content[:100].lower():
        OUT = "❌ PERMISSIONS ERROR: Please ensure Google Sheets is shared as 'Anyone with the link (Viewer)'."
    else:
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)

        if len(rows) < 5:
            OUT = "⚠️ The sheet '{}' is empty or does not match the expected audit layout.".format(sheet_name)
        else:
            # 3. Extract the Element GUID from Row 3, Column B (indexes 2 and 1)
            sheet_guid = rows[2][1].strip()
            project_info = doc.ProjectInformation
            
            if not project_info:
                OUT = "❌ ERROR: Project Information object not found in Revit."
            elif str(project_info.UniqueId) != sheet_guid and sheet_guid != "N/A":
                OUT = "❌ CRITICAL SECURITY ALERT: The Unique GUID of this Revit model does not match the GUID stored in Google Sheets. Update aborted to prevent cross-project parameter corruption."
            else:
                is_workshared = doc.IsWorkshared
                
                # Start transaction
                TransactionManager.Instance.EnsureInTransaction(doc)

                summary = {
                    "✅ Parameters Updated": 0,
                    "🔒 Locked or Read-Only": 0,
                    "⚠️ Skipped (Already Up-to-date)": 0,
                    "❌ Not Found in Revit": 0
                }

                # 4. Actual parameter rows start at Row 5 (index 4)
                data_rows = rows[4:]

                for row in data_rows:
                    if len(row) < 2: 
                        continue
                    
                    param_name = row[0].strip()
                    val_sheet = row[1].strip()

                    # Skip empty/header rows (blue headers in Sheets do not have values)
                    if val_sheet == "" and (len(row) < 3 or row[2].strip() == ""):
                        continue

                    # Search parameter in Project Information
                    param = project_info.LookupParameter(param_name)
                    
                    if not param:
                        summary["❌ Not Found in Revit"] += 1
                        continue
                        
                    if param.IsReadOnly:
                        summary["🔒 Locked or Read-Only"] += 1
                        continue

                    # Worksharing safety check
                    if is_workshared:
                        param_owner = param.Element
                        checkout_status = WorksharingUtils.GetCheckoutStatus(doc, param_owner.Id)
                        if checkout_status == CheckoutStatus.OwnedByOtherUser:
                            summary["🔒 Locked or Read-Only"] += 1
                            continue
                    
                    # 5. Inject value based on storage type
                    try:
                        # --- STRING (Text) ---
                        if param.StorageType == StorageType.String:
                            if param.AsString() != val_sheet:
                                param.Set(val_sheet)
                                summary["✅ Parameters Updated"] += 1
                            else:
                                summary["⚠️ Skipped (Already Up-to-date)"] += 1
                                
                        # --- INTEGER (Numbers / Booleans) ---
                        elif param.StorageType == StorageType.Integer:
                            current_int = param.AsInteger()
                            try:
                                new_int = int(val_sheet)
                                if current_int != new_int:
                                    param.Set(new_int)
                                    summary["✅ Parameters Updated"] += 1
                                else:
                                    summary["⚠️ Skipped (Already Up-to-date)"] += 1
                            except ValueError:
                                pass
                                
                        # --- DOUBLE (Decimals / Measurements) ---
                        elif param.StorageType == StorageType.Double:
                            current_double = param.AsDouble()
                            try:
                                new_double = float(val_sheet.replace(',', '.'))
                                if current_double != new_double:
                                    param.Set(new_double)
                                    summary["✅ Parameters Updated"] += 1
                                else:
                                    summary["⚠️ Skipped (Already Up-to-date)"] += 1
                            except ValueError:
                                pass
                    except Exception:
                        summary["🔒 Locked or Read-Only"] += 1

                # Commit transaction
                TransactionManager.Instance.TransactionTaskDone()

                # Build report output
                report = "📊 PROJECT INFO IMPORT COMPLETED\nProcessed Tab: {}\n".format(sheet_name)
                report += "-"*45 + "\n"
                for key, val in summary.items():
                    report += "{}: {}\n".format(key, val)
                    
                OUT = report

except Exception as e:
    OUT = "❌ CRITICAL IMPORT ERROR: " + str(e) + "\n" + traceback.format_exc()
