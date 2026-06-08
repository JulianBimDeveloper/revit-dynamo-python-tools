import os
import json
import re

def clean_filename(name):
    """
    Cleans a string to make it a valid filename.
    """
    # Remove invalid chars and replace spaces with underscores
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    name = name.replace(" ", "_")
    return name if name else "python_script"

def extract_python_from_dyn(dyn_path):
    """
    Reads a Dynamo (.dyn) JSON file, extracts Python scripts from nodes,
    and saves them as separate .py files in a subfolder.
    """
    print(f"Reading Dynamo file: {dyn_path}")
    try:
        with open(dyn_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading {dyn_path}: {e}")
        return

    # Check if 'Nodes' key exists (Dynamo 2.x JSON format)
    nodes = data.get("Nodes", [])
    if not nodes:
        print(f"No nodes found in {dyn_path}. Is this a modern Dynamo 2.x JSON file?")
        return

    # Find nodes containing Python code
    python_nodes = []
    for node in nodes:
        concrete_type = node.get("ConcreteType", "")
        node_type = node.get("NodeType", "")
        code = node.get("Code", "")
        
        # Check if the node is a Python node by checking concrete type, node type, or if it has code
        is_python = (
            "Python" in concrete_type or 
            node_type == "PythonScriptNode" or 
            code != ""
        )
        
        # Only process if we actually found code in it
        if is_python and code:
            python_nodes.append(node)

    if not python_nodes:
        print(f"No Python script nodes found in {dyn_path}.")
        return

    # Create an output folder named after the dynamo file
    base_dir = os.path.dirname(dyn_path)
    dyn_filename = os.path.splitext(os.path.basename(dyn_path))[0]
    output_dir = os.path.join(base_dir, f"{clean_filename(dyn_filename)}_extracted_python")
    
    os.makedirs(output_dir, exist_ok=True)
    print(f"Found {len(python_nodes)} Python node(s). Exporting to: {output_dir}")

    for idx, node in enumerate(python_nodes):
        node_name = node.get("Name", f"Python_Script_{idx+1}")
        clean_name = clean_filename(node_name)
        code_content = node.get("Code", "")
        
        # Replace Windows carriage returns for clean git line endings
        code_content = code_content.replace("\r\n", "\n")
        
        output_file_name = f"{clean_name}.py"
        output_file_path = os.path.join(output_dir, output_file_name)
        
        try:
            with open(output_file_path, 'w', encoding='utf-8') as pf:
                pf.write(code_content)
            print(f"  -> Extracted: {output_file_name}")
        except Exception as e:
            print(f"  -> Error saving {output_file_name}: {e}")

def scan_and_extract(target_path):
    """
    Scans a file or folder recursively for .dyn files and extracts Python code.
    """
    if os.path.isfile(target_path):
        if target_path.lower().endswith('.dyn'):
            extract_python_from_dyn(target_path)
        else:
            print("The provided file is not a .dyn file.")
    elif os.path.isdir(target_path):
        print(f"Scanning directory recursively: {target_path}")
        found = False
        for root, _, files in os.walk(target_path):
            for file in files:
                if file.lower().endswith('.dyn'):
                    found = True
                    dyn_path = os.path.join(root, file)
                    extract_python_from_dyn(dyn_path)
        if not found:
            print("No .dyn files found in the directory.")
    else:
        print("Invalid path provided.")

if __name__ == "__main__":
    import sys
    # If a path is provided as argument, process it. Otherwise, scan current directory.
    if len(sys.argv) > 1:
        path = sys.argv[1]
    else:
        path = os.getcwd()
    
    scan_and_extract(path)
