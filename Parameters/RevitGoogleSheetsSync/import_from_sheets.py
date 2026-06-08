# -*- coding: utf-8 -*-
"""
Revit Dynamo Python Script
Title: Import BIM Parameters from Google Sheets
Description: Reads audit parameter data directly from a Google Sheet (via CSV export API),
             identifies elements by Unique ID, and updates their Revit parameters (Instance or Type).
             Includes collaborative safeguards (worksharing status checks).
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

# Import RevitAPI
clr.AddReference('RevitAPI')
from Autodesk.Revit.DB import *

# Import RevitServices
clr.AddReference('RevitServices')
import RevitServices
from RevitServices.Persistence import DocumentManager

doc = DocumentManager.Instance.CurrentDBDocument

try:
    # --- INPUTS ---
    # IN[0]: Google Spreadsheet URL
    url_input = str(IN[0]).strip()

    # Determine tab name from active document title
    file_name = doc.Title
    parts = file_name.split('-')
    discipline = parts[4] if len(parts) > 4 else "GEN"
    suffix = file_name.split('_')[-1].replace('.rvt', '').upper()
    
    # Target sheet tab name format matches export: "DISCIPLINE_AUDIT_MODELNAME"
    sheet_name = "{}_AUDIT_{}".format(discipline, suffix)

    # Convert standard Google Sheet URL to direct CSV visualization query endpoint
    base_url = url_input.split('/edit')[0]
    url_csv = base_url + "/gviz/tq?tqx=out:csv&sheet=" + urllib.parse.quote(sheet_name)
    
    req = urllib.request.Request(url_csv)
    with urllib.request.urlopen(req) as response:
        content = response.read().decode('utf-8-sig')
    
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    
    if len(rows) < 2:
        OUT = "⚠️ The spreadsheet is empty or the tab does not exist: " + sheet_name
    else:
        headers = [h.replace('"', '').strip() for h in rows[0]]
        data_rows = rows[1:]
        
        # Start Transaction
        t = Transaction(doc, "Import BIM Parameters (Collaborative Sync)")
        t.Start()
        
        count_updated = 0
        count_found = 0
        count_locked = 0
        error_logs = []
        
        for row in data_rows:
            try:
                if len(row) < 3: 
                    continue
                
                # Column C (index 2) contains the Revit Unique ID
                u_id = row[2].replace('"', '').strip()
                element = doc.GetElement(u_id)
                
                if not element: 
                    continue
                
                # --- WORKSHARING SAFETY GUARD ---
                # Check if the element is currently checked out (locked) by another user
                if doc.IsWorkshared:
                    checkout_status = WorksharingUtils.GetCheckoutStatus(doc, element.Id)
                    if checkout_status == CheckoutStatus.OwnedByOtherUser:
                        count_locked += 1
                        if len(error_logs) < 15:
                            error_logs.append("Element ID {} is locked by another user.".format(element.Id.IntegerValue))
                        continue
                
                count_found += 1
                element_type = doc.GetElement(element.GetTypeId())
                
                # Parameters to write start at Column F (index 5)
                for i in range(5, len(headers)):
                    if i >= len(row): 
                        break
                    
                    param_name = headers[i]
                    # Skip error diagnosis and system columns
                    if "DIAGN" in param_name.upper() or "ERROR" in param_name.upper():
                        continue
                        
                    val_str = row[i].replace('"', '').strip()
                    
                    # Look up parameter on Instance, fall back to Type
                    param = element.LookupParameter(param_name)
                    if not param and element_type:
                        param = element_type.LookupParameter(param_name)
                        
                    if param and not param.IsReadOnly:
                        try:
                            # --- Storage Type: DOUBLE (Numbers) ---
                            if param.StorageType == StorageType.Double:
                                if val_str != "" and val_str != "N/A":
                                    val_double = float(val_str.replace(',', '.'))
                                    # Write only if value has changed or was empty
                                    if not param.HasValue or abs(param.AsDouble() - val_double) > 0.0001:
                                        param.Set(val_double)
                                        count_updated += 1
                                            
                            # --- Storage Type: INTEGER / BOOLEAN ---
                            elif param.StorageType == StorageType.Integer:
                                if val_str != "" and val_str != "N/A":
                                    val_upper = val_str.upper()
                                    if val_upper in ["TRUE", "VERDADERO"]:
                                        val_int = 1
                                    elif val_upper in ["FALSE", "FALSO"]:
                                        val_int = 0
                                    else:
                                        val_int = int(float(val_str.replace(',', '.')))
                                            
                                    # Force write even if value is 0 (handles zero-fill mapping)
                                    if not param.HasValue or param.AsInteger() != val_int:
                                        param.Set(val_int)
                                        count_updated += 1
                                            
                            # --- Storage Type: STRING (Text) ---
                            elif param.StorageType == StorageType.String:
                                current_val = param.AsString() if param.HasValue else ""
                                if current_val is None: 
                                    current_val = ""
                                    
                                if current_val != val_str:
                                    param.Set(val_str)
                                    count_updated += 1
                                        
                        except Exception as ex_set:
                            err_msg = "Error updating Element ID {} (Param: {}): Format mismatch or parameter locked.".format(element.Id.IntegerValue, param_name)
                            if err_msg not in error_logs and len(error_logs) < 15:
                                error_logs.append(err_msg)
                            
            except Exception as row_ex: 
                continue 
            
        t.Commit()
        
        # --- OUTPUT RESPONSE ---
        result_msg = "✅ IMPORT SUCCESSFUL (COLLABORATIVE MODE)\n"
        result_msg += "Tab read: {}\n".format(sheet_name)
        result_msg += "Processed elements found: {}\n".format(count_found)
        result_msg += "Updated parameters: {}\n".format(count_updated)
        
        if count_locked > 0:
            result_msg += "\n⚠️ ELEMENTS SKIPPED DUE TO WORKSHARING LOCKS: {}\n".format(count_locked)
            
        if len(error_logs) > 0:
            result_msg += "\nDetail of skipped/errored parameters:\n"
            for err in error_logs:
                result_msg += "- {}\n".format(err)
                
        OUT = result_msg

except Exception as e:
    OUT = "❌ CRITICAL IMPORT ERROR: " + str(e) + "\n" + traceback.format_exc()
