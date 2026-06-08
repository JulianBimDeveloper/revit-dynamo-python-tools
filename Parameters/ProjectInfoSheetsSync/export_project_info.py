# -*- coding: utf-8 -*-
"""
Revit Dynamo Python Script
Title: Export Project Information to Google Sheets
Description: Extracts all parameters from the Project Information object and POSTs them
             to a Google Sheets Web App. Automatically opens the spreadsheet in the default browser.
Author: Julian Mejia
Date: June 2026
Revit Compatibility: 2020 - 2025+
"""

import clr
import json
import urllib.request
import traceback
import webbrowser

# Import RevitServices
clr.AddReference('RevitServices')
import RevitServices
from RevitServices.Persistence import DocumentManager

# Import RevitAPI
clr.AddReference('RevitAPI')
from Autodesk.Revit.DB import *

doc = DocumentManager.Instance.CurrentDBDocument

def get_param_value(p):
    """
    Safely retrieves the parameter value as a string.
    """
    if p and p.HasValue:
        val_string = p.AsValueString()
        if val_string: 
            return val_string
        if p.StorageType == StorageType.Double: 
            return str(p.AsDouble())
        elif p.StorageType == StorageType.Integer: 
            return str(p.AsInteger())
        else: 
            return p.AsString()
    return ""

def get_group_name(p):
    """
    Safely retrieves the human-readable group name of the parameter.
    """
    try: 
        return LabelUtils.GetLabelForGroup(p.Definition.GetGroupTypeId())
    except:
        try: 
            return LabelUtils.GetLabelFor(p.Definition.ParameterGroup)
        except: 
            return "Other"

try:
    # --- INPUTS ---
    # IN[0]: Google Sheets Web App deployment URL (Webhook)
    # IN[1]: Target Spreadsheet URL to open in the browser
    url_webhook = str(IN[0]).strip()
    url_visualization = str(IN[1]).strip()
    doc_name = doc.Title

    project_info = doc.ProjectInformation
    
    if not project_info:
        OUT = "⚠️ Project Information element not found in this model."
    else:
        payload_data = {
            "Document_Name": doc_name,
            "Project_Info_Id": str(project_info.UniqueId),
            "targetSpreadsheetUrl": url_visualization, # Send spreadsheet URL to Apps Script
            "parameters": []
        }
        
        for p in project_info.Parameters:
            p_name = p.Definition.Name
            p_value = get_param_value(p)
            is_readonly = p.IsReadOnly
            group_name = get_group_name(p)
            
            if p_name:
                payload_data["parameters"].append({
                    "name": p_name, 
                    "value": p_value,
                    "is_readonly": is_readonly, 
                    "group": group_name
                })

        # --- POST payload ---
        if url_webhook.startswith("http"):
            payload = json.dumps([payload_data]).encode('utf-8')
            req = urllib.request.Request(url_webhook, data=payload, method='POST')
            req.add_header('Content-Type', 'application/json')
            
            with urllib.request.urlopen(req) as f:
                server_response = f.read().decode('utf-8')
            
            # --- Open browser dynamically ---
            if url_visualization.startswith("http"):
                webbrowser.open(url_visualization)
            
            OUT = f"✅ Export completed successfully. Browser opened.\nServer Response: {server_response}"
        else:
            OUT = "⚠️ Invalid Webhook URL."

except Exception as e:
    OUT = "❌ LOCAL DYNAMO ERROR: " + str(e) + "\n" + traceback.format_exc()
