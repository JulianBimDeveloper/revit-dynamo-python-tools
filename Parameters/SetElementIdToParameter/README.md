# Set Element ID to Parameter

This script writes the unique Revit `ElementId` to a specific parameter of all processed elements.

## 💡 Use Case
Often in BIM collaboration, external applications (databases, web viewers, or custom platforms) require a persistent, readable representation of the Revit Element ID. This script automates mapping the native `ElementId` into a custom user parameter (e.g., `BIM_Element_ID`).

## 🔧 Dynamo Node Configuration
- **IN[0]** (String, optional): The name of the target parameter (e.g., `"BIM_Element_ID"`). If left unconnected, it defaults to `"BIM_Element_ID"`.
- **IN[1]** (List of Elements, optional): The elements to process. If left unconnected, it will automatically query all model elements in the active document.
- **OUT** (String): A summary status message containing the count of successfully updated elements and errors.

## ⚡ Revit API Compatibility
This script handles the API shift introduced in **Revit 2024** where `ElementId` transitioned from 32-bit to 64-bit:
- For **Revit 2024 and 2025+**, it uses `.Value` (returns a 64-bit integer).
- For **Revit 2023 and older**, it falls back to `.IntegerValue` (32-bit integer).
