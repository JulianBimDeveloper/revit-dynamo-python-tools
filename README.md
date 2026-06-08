# Revit Dynamo Python Tools

A curated collection of professional Python scripts designed for automation, quality control, and data management in Autodesk Revit using Dynamo.

## 🚀 Overview

This repository showcases production-grade Python scripts embedded within Dynamo graphs (`.dyn`). By isolating the Python source code (`.py`), this repository enables:
- Easy code readability and revision tracking (diffs).
- Direct peer review and quality assurance.
- Standard coding practices (PEP 8, clean imports, and structured error handling).

## 📁 Directory Structure

The tools are organized by discipline and functional scope:
- **`Architecture/`**: Tools for automated sheet naming, view alignment, and room scheduling.
- **`MEP/`**: Scripts for checking duct/pipe connections, space management, and parameter synchronization.
- **`Parameters/`**: Global parameter validation, shared parameter mapping, and schema updates.
- **`Utilities/`**: General Dynamo helper scripts (list manipulation, file system integrations, etc.).
- **`extractor/`**: Automate extraction of code from your `.dyn` files.

---

## 🛠️ Automatically Extracting Python from Dynamo

If you have `.dyn` files, you can extract their Python script nodes automatically using our custom utility script:

1. Copy your `.dyn` files into the directory.
2. Run the extractor script:
   ```bash
   python extract_dynamo_python.py
   ```
3. A directory containing all the extracted `.py` files will be created automatically.

## ⚖️ License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
