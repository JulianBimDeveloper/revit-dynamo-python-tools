# -*- coding: utf-8 -*-
"""
Revit Dynamo Python Script
Title: Select Element by Unique ID
Description: Retrieves Revit elements using their unique 36-character Unique ID string.
Author: Julian Mejia
Date: June 2026
Revit Compatibility: 2020 - 2025+
"""

import clr

# Import RevitServices
clr.AddReference('RevitServices')
import RevitServices
from RevitServices.Persistence import DocumentManager

# Import RevitAPI
clr.AddReference('RevitAPI')
from Autodesk.Revit.DB import *

# Get current document
doc = DocumentManager.Instance.CurrentDBDocument

# --- INPUTS ---
# IN[0]: Single Unique ID string or list of Unique ID strings
input_ids = IN[0]

# Check if input is a list or a single string
if isinstance(input_ids, list):
    unique_ids = input_ids
else:
    unique_ids = [input_ids]

output_elements = []

for uid in unique_ids:
    if not uid or not isinstance(uid, str):
        output_elements.append(None)
        continue
    
    try:
        # Get element by Unique ID from current Revit Document
        element = doc.GetElement(uid)
        if element:
            output_elements.append(element)
        else:
            output_elements.append(None)
    except Exception:
        # If the Unique ID format is invalid or element not found, append None
        output_elements.append(None)

# --- OUTPUT ---
# Return a list if the input was a list, or a single element if the input was a single string
if isinstance(input_ids, list):
    OUT = output_elements
else:
    OUT = output_elements[0] if output_elements else None
