# -*- coding: utf-8 -*-
"""
Revit Dynamo Python Script
Title: Set Element ID to Parameter
Description: Writes the unique Element ID of Revit elements to a user-defined parameter.
Author: Julian Mejia
Date: June 2026
Revit Compatibility: 2020 - 2025+ (handles 64-bit ElementId changes in Revit 2024+)
"""

import clr

# Import RevitServices and Transaction Manager
clr.AddReference('RevitServices')
import RevitServices
from RevitServices.Persistence import DocumentManager
from RevitServices.Transactions import TransactionManager

# Import RevitAPI
clr.AddReference('RevitAPI')
from Autodesk.Revit.DB import FilteredElementCollector

# Get current document
doc = DocumentManager.Instance.CurrentDBDocument

# --- INPUTS ---
# IN[0]: Target parameter name (string)
# IN[1]: List of elements to process (optional). If empty, processes all model instances.
target_parameter_name = IN[0] if IN[0] is not None else "BIM_Element_ID"
input_elements = IN[1]

# If no elements are supplied, collect all physical instances in the document (excluding element types)
if not input_elements:
    collector = FilteredElementCollector(doc).WhereElementIsNotElementType().ToElements()
else:
    # Ensure we have a list of elements even if a single element was passed
    if isinstance(input_elements, list):
        collector = input_elements
    else:
        collector = [input_elements]

count_success = 0
count_error = 0

# Start transaction
TransactionManager.Instance.EnsureInTransaction(doc)

for element in collector:
    if element is None:
        continue
        
    # Attempt to retrieve the parameter
    param = element.LookupParameter(target_parameter_name)
    
    # Check if parameter exists and is writeable
    if param and not param.IsReadOnly:
        try:
            element_id = element.Id
            
            # Revit 2024 and newer use 64-bit integers for ElementId (element_id.Value)
            # Revit 2023 and older use 32-bit integers (element_id.IntegerValue)
            try:
                # Attempt 64-bit (Revit 2024+)
                param.Set(element_id.Value)
            except AttributeError:
                # Fallback to 32-bit (Revit 2023 and older)
                param.Set(element_id.IntegerValue)
                
            count_success += 1
        except Exception:
            count_error += 1

# Commit transaction
TransactionManager.Instance.TransactionTaskDone()

# --- OUTPUT ---
OUT = "Success: {} elements updated. Errors/Skipped: {}.".format(count_success, count_error)
