# Select Element by Unique ID

This script retrieves Revit elements directly from the active document using their 36-character Unique ID string.

## 💡 Use Case
Unlike standard Revit Element IDs (which are sequential integers and can change if elements are workshared or synced), a `UniqueID` is a globally unique identifier (GUID) that remains constant. This script is highly useful when debugging IFC/BIM files, searching for specific elements reported in error logs, or selecting elements from external database records.

## 🔧 Dynamo Node Configuration
- **IN[0]** (String / List of Strings): A single 36-character Revit Unique ID or a list of Unique IDs.
- **OUT** (Element / List of Elements): The matching Revit Element object(s). If an ID is invalid or the element no longer exists in the model, it returns `null` (`None`) at that position.

## ⚡ Technical Details
- Built using native Revit API: `doc.GetElement(UniqueIDString)`.
- Handles both single string inputs and lists of strings, matching the output format dynamically.
- Includes exception handling to prevent Dynamo execution failure if an invalid ID is supplied.
