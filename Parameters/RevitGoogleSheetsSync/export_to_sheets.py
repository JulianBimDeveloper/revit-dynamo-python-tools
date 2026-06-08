# -*- coding: utf-8 -*-
"""
Revit Dynamo Python Script
Title: Export BIM Parameters to Google Sheets
Description: Extracts BIM parameters from model elements, filters out non-model elements,
             and sends a JSON payload to a Google Apps Script Web App to populate a spreadsheet.
Author: Julian Mejia
Date: June 2026
Revit Compatibility: 2020 - 2025+
"""

import clr
import json
import urllib.request
import traceback
import webbrowser
import re

# Import RevitServices
clr.AddReference('RevitServices')
import RevitServices
from RevitServices.Persistence import DocumentManager

# Import RevitAPI
clr.AddReference('RevitAPI')
from Autodesk.Revit.DB import *

doc = DocumentManager.Instance.CurrentDBDocument

try:
    # --- INPUTS ---
    # IN[0]: Google Sheets Web App Deployment URL
    # IN[1]: Target Google Spreadsheet URL (dynamic sheet connection)
    url_web_app = str(IN[0]).strip()
    target_spreadsheet_url = str(IN[1]).strip() if IN[1] is not None else ""
    project_guid = str(doc.ProjectInformation.UniqueId)
    
    # Collect all view-independent model elements
    collector = FilteredElementCollector(doc).WhereElementIsNotElementType().WhereElementIsViewIndependent()
    
    data = []

    # List of generic parameters to extract (Corresponds to columns in the Google Sheet)
    parameters_to_extract = [
        "BIM_Product_Code", "BIM_Product_Description", "BIM_Discipline", 
        "BIM_Subdiscipline", "BIM_Zonification", "BIM_Status_Code", 
        "BIM_Study_Code", "BIM_Status_Description", "BIM_Definition_Source", 
        "BIM_Km_Start", "BIM_Km_End", "BIM_Object_ID",
        "BIM_Relocation_Code", "BIM_Comment_Source", "BIM_Temp_Visibility",
        "BIM_Activity_Code", "BIM_Phase", "BIM_Activity_Start", "BIM_Activity_End",
        "BIM_Execution_Percent", "BIM_Chapter", "BIM_Measurement", "BIM_Partida", "BIM_Unit",
        "BIM_Doc1", "BIM_Doc2"
    ]

    # --- Shield 1: Excluded Categories (Internal System Elements) ---
    excluded_categories = [
        int(BuiltInCategory.OST_ProjectInformation), 
        int(BuiltInCategory.OST_Sheets),             
        int(BuiltInCategory.OST_Views),              
        int(BuiltInCategory.OST_TitleBlocks),        
        int(BuiltInCategory.OST_Schedules),
        int(BuiltInCategory.OST_HVAC_Zones),         # HVAC Zones
        int(BuiltInCategory.OST_MEPSpaces),          # Spaces
        int(BuiltInCategory.OST_Rooms)               # Rooms
    ]
    
    # --- Shield 2: Excluded Category Names ---
    prohibited_names = [
        "Plano", "Planos", "Sheet", "Sheets", 
        "Información de proyecto", "Project Information",
        "Zonas de climatización", "Zona de climatización", "HVAC Zone"
    ]

    for element in collector:
        # --- Shield 3: API Class Filtering ---
        try:
            # Skip views, sheets, project info, and spatial elements (Rooms, Spaces)
            if isinstance(element, View) or isinstance(element, ViewSheet) or isinstance(element, ProjectInfo) or isinstance(element, SpatialElement):
                continue
                
            if element.Category:
                cat_id = element.Category.Id
                cat_int = cat_id.Value if hasattr(cat_id, "Value") else cat_id.IntegerValue
                if cat_int in excluded_categories:
                    continue
                    
                cat_name = element.Category.Name
                if any(prohibited in cat_name for prohibited in prohibited_names):
                    continue
        except:
            pass 
        
        # Security Filter: Only process if the element contains parameter definitions starting with "BIM_"
        has_target_params = False
        try:
            # Check instance parameters
            for param in element.Parameters:
                if param.Definition and param.Definition.Name and param.Definition.Name.startswith("BIM_"):
                    has_target_params = True
                    break
            # Check type parameters if not found on instance
            if not has_target_params:
                el_type_tmp = doc.GetElement(element.GetTypeId())
                if el_type_tmp:
                    for param in el_type_tmp.Parameters:
                        if param.Definition and param.Definition.Name and param.Definition.Name.startswith("BIM_"):
                            has_target_params = True
                            break
        except:
            pass
            
        if not has_target_params:
            continue

        # Extract Family and Type Names
        type_name = "N/A"
        family_name = "N/A"
        element_type = None
        
        try:
            t_id = element.GetTypeId()
            if t_id != ElementId.InvalidElementId:
                element_type = doc.GetElement(t_id)
        except: pass

        try:
            if hasattr(element, "Name") and element.Name: 
                type_name = element.Name
        except: pass

        try:
            if element_type and hasattr(element_type, "FamilyName") and element_type.FamilyName:
                family_name = element_type.FamilyName
            elif element.Category:
                family_name = element.Category.Name
        except: pass
            
        if any(prohibited in family_name for prohibited in prohibited_names):
            continue

        # Extract Parameter Values
        extracted_values = {}
        for param_name in parameters_to_extract:
            param = element.LookupParameter(param_name)
            # Fallback to Type parameter if Instance parameter doesn't exist
            if not param and element_type:
                param = element_type.LookupParameter(param_name)
                
            if param:
                try:
                    if param.StorageType == StorageType.Double:
                        extracted_values[param_name] = param.AsDouble()
                    elif param.StorageType == StorageType.Integer:
                        extracted_values[param_name] = param.AsInteger()
                    else:
                        extracted_values[param_name] = param.AsString() or ""
                except:
                    extracted_values[param_name] = ""
            else:
                extracted_values[param_name] = "" 

        data.append({
            "projectGuid": project_guid, 
            "documentName": doc.Title, 
            "uniqueId": str(element.UniqueId), 
            "family": family_name,
            "type": type_name,
            "actuals": extracted_values,
            "targetSpreadsheetUrl": target_spreadsheet_url
        })

    # --- TRANSMIT DATA ---
    if data and "http" in url_web_app:
        payload = json.dumps(data).encode('utf-8')
        req = urllib.request.Request(url_web_app, data=payload, method='POST')
        req.add_header('Content-Type', 'application/json')
        
        with urllib.request.urlopen(req) as response:
            google_response = response.read().decode('utf-8')
        
        # Parse the spreadsheet URL returned by Google Apps Script to open in a web browser
        match = re.search(r'(https://docs\.google\.com/spreadsheets/[^\s]+)', google_response)
        if match:
            sheet_url = match.group(1).replace('"', '').replace(']', '')
            webbrowser.open(sheet_url)
        
        OUT = "SUCCESS\n" + google_response
    else:
        OUT = "⚠️ No matching elements found or Web App URL is invalid."

except Exception as e:
    OUT = "❌ LOCAL DYNAMO ERROR: " + str(e) + "\n" + traceback.format_exc()
