/**
 * BIM Parameter Audit Dashboard - Google Apps Script
 * Receives exported element parameters from Revit via Dynamo, validates them
 * against a master database sheet, flags errors, and updates a dashboard.
 * 
 * Master Spreadsheet Configuration Requirements:
 * Must contain sheets named:
 * 1. "VAL_CLASSIFICATION" (Columns: Code, Description, Unit, etc.)
 * 2. "VAL_ATRIBUTOS_01"
 * 3. "VAL_ZONING"
 * 4. "VAL_ATRIBUTOS_03"
 */

// URL of the Master Database spreadsheet
var MASTER_DB_URL = "https://docs.google.com/spreadsheets/d/YOUR_MASTER_DATABASE_SPREADSHEET_ID/edit";

// --- Color Scheme ---
var COLOR_INPUT   = "#cfe2f3"; // Light Blue (User inputs)
var COLOR_IDS     = "#d9d2e9"; // Light Purple (IDs)
var COLOR_CONTEXT = "#ffffff"; // White (Context/Default)
var COLOR_VALID   = "#d9ead3"; // Light Green (Valid data)
var COLOR_WARNING = "#fce5cd"; // Light Orange (Errors/Warnings)
var COLOR_HEADER  = "#444444"; // Dark Grey (Headers)

// --- Matrix Lookup Indexes ---
var IDX_CLASS_CODE = 0; // Col A (Classification Code)
var IDX_CLASS_DESC = 1; // Col B (Classification Description)
var IDX_CLASS_UNIT = 6; // Col G (Unit of Measurement)

var IDX_ATTR_CODE  = 1; 
var IDX_ATTR_DESC  = 2; 
var IDX_ATTR_DISC  = 3; 
var IDX_ATTR_SUBD  = 4; 
var IDX_ATTR_STUDY = 8; 

var IDX_ZONE_CODE  = 0; 
var IDX_STATUS_CODE = 1; 
var IDX_STATUS_DESC = 2; 

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🛠️ BIM AUDIT')
      .addItem('✅ Validate & Curate Data', 'curateAndValidateData')
      .addItem('📊 Update Dashboard Manual', 'updateDashboardManual')
      .addToUi();
}

function updateDashboardManual() {
  updateDashboard("Manual Update from GSheets Menu");
}

// ============================================================================
// 1. DATA RECEIPT (DYNAMO -> GOOGLE SHEETS POST ENDPOINT)
// ============================================================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("ERROR: Empty request body.");
    }
    
    var contents = JSON.parse(e.postData.contents);
    var targetSpreadsheetUrl = contents[0].targetSpreadsheetUrl;
    
    var ss;
    if (targetSpreadsheetUrl && targetSpreadsheetUrl !== "") {
      ss = SpreadsheetApp.openByUrl(targetSpreadsheetUrl);
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    // Open the master database spreadsheet
    var ssRef = SpreadsheetApp.openByUrl(MASTER_DB_URL);
    var masterClassification = ssRef.getSheetByName("VAL_CLASSIFICATION").getDataRange().getValues(); 
    var masterAttributes01  = ssRef.getSheetByName("VAL_ATRIBUTOS_01").getDataRange().getValues(); 
    var masterZoning        = ssRef.getSheetByName("VAL_ZONING").getDataRange().getValues(); 
    var masterAttributes03  = ssRef.getSheetByName("VAL_ATRIBUTOS_03").getDataRange().getValues();

    // Create a tab named after the model file
    var fileName = contents[0].documentName || "Model";
    var parts = fileName.split('-');
    // Sheet name format: "DISCIPLINE_AUDIT_MODELNAME"
    var sheetName = (parts[4] || "GEN") + "_AUDIT_" + (fileName.split('_').pop().replace('.rvt','')).toUpperCase();
    var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

    var allRows = []; 
    var allColors = [];

    for (var i = 0; i < contents.length; i++) {
      var item = contents[i];
      var rowValues = new Array(32).fill("");
      var rowColors = new Array(32).fill(COLOR_CONTEXT);
      var errorList = []; 

      // Retrieve values from the JSON payload
      var valProdDesc = String(item.actuals.BIM_Product_Description || "").trim();
      var valZoning   = String(item.actuals.BIM_Zonification || "").trim();
      var valStatus   = String(item.actuals.BIM_Status_Description || "").trim();
      var valSourceDef = String(item.actuals.BIM_Definition_Source || "").trim();

      var valFamily   = String(item.family || "N/A").trim();
      var valType     = String(item.type || "N/A").trim();
      var valObjId    = String(item.actuals.BIM_Object_ID || "").trim();

      // Cross-referencing with Master DB
      var rowClass = findExactRow(valProdDesc, masterClassification, IDX_CLASS_DESC); 
      var classCode = rowClass[IDX_CLASS_CODE] || ""; 
      var classUnit = rowClass[IDX_CLASS_UNIT] || "N/A";

      var rowAttr = findExactRow(classCode, masterAttributes01, IDX_ATTR_CODE);
      if (rowAttr.length === 0 && valProdDesc !== "") { 
        rowAttr = findExactRow(valProdDesc, masterAttributes01, IDX_ATTR_DESC); 
      }
      
      var rowZone = findExactRow(valZoning, masterZoning, IDX_ZONE_CODE);
      var rowStatus = findExactRow(valStatus, masterAttributes03, IDX_STATUS_DESC);

      var dbDiscipline = rowAttr[IDX_ATTR_DISC] || ""; 
      var dbSubdiscipline = rowAttr[IDX_ATTR_SUBD] || ""; 
      var dbStudyCode = rowAttr[IDX_ATTR_STUDY] || ""; 
      var dbKmStart = (rowZone.length > 2 && rowZone[2] !== "") ? rowZone[2] : "";
      var dbKmEnd = (rowZone.length > 3 && rowZone[3] !== "") ? rowZone[3] : "";
      var dbStatusCode = rowStatus[IDX_STATUS_CODE] || ""; 

      var finalCode = classCode !== "" ? classCode : "N/A";
      
      // Column Mapping (0-16)
      rowValues[0] = contents[0].projectGuid;
      rowValues[1] = item.uniqueId;
      rowValues[2] = item.uniqueId;
      rowValues[3] = valFamily; 
      rowValues[4] = valType;
      
      rowValues[5] = finalCode;             
      rowColors[5] = (finalCode === "N/A") ? COLOR_WARNING : COLOR_VALID;
      
      rowValues[6] = valProdDesc;       
      rowColors[6] = (valProdDesc === "") ? COLOR_WARNING : COLOR_INPUT;
      
      rowValues[7] = dbDiscipline !== "" ? dbDiscipline : "N/A";       
      rowColors[7] = (dbDiscipline === "") ? COLOR_WARNING : COLOR_VALID;
      
      rowValues[8] = dbSubdiscipline !== "" ? dbSubdiscipline : "N/A";       
      rowColors[8] = (dbSubdiscipline === "") ? COLOR_WARNING : COLOR_VALID;
      
      rowValues[9] = valZoning;       
      rowColors[9] = (valZoning === "") ? COLOR_WARNING : COLOR_INPUT;
      
      rowValues[10] = dbStatusCode !== "" ? dbStatusCode : "N/A"; 
      rowColors[10] = (dbStatusCode === "") ? COLOR_WARNING : COLOR_VALID;
      
      rowValues[11] = dbStudyCode !== "" ? dbStudyCode : "N/A";           
      rowColors[11] = (dbStudyCode === "") ? COLOR_WARNING : COLOR_VALID;
      
      rowValues[12] = valStatus;      
      rowColors[12] = (valStatus === "") ? COLOR_WARNING : COLOR_INPUT;
      
      rowValues[13] = valSourceDef;     
      rowColors[13] = (valSourceDef === "") ? COLOR_WARNING : COLOR_INPUT;
      
      rowValues[14] = dbKmStart !== "" ? dbKmStart : "N/A";        
      rowColors[14] = (dbKmStart === "") ? COLOR_CONTEXT : COLOR_VALID;
      
      rowValues[15] = dbKmEnd !== "" ? dbKmEnd : "N/A";        
      rowColors[15] = (dbKmEnd === "") ? COLOR_CONTEXT : COLOR_VALID;
      
      rowValues[16] = valObjId !== "" ? valObjId : "N/A";      
      rowColors[16] = (valObjId === "") ? COLOR_CONTEXT : COLOR_IDS;

      var getVal = function(val, def) { 
        return (val === undefined || val === null || val === "") ? def : val; 
      };

      // Columns (17-30)
      rowValues[17] = getVal(item.actuals.BIM_Relocation_Code, "N/A");
      rowValues[18] = getVal(item.actuals.BIM_Comment_Source, "N/A");
      
      var visVal = item.actuals.BIM_Temp_Visibility;
      rowValues[19] = (visVal === 0 || visVal === "0" || visVal === false) ? false : true;
      
      rowValues[20] = getVal(item.actuals.BIM_Activity_Code, "N/A");
      rowValues[21] = getVal(item.actuals.BIM_Phase, "N/A");
      rowValues[22] = getVal(item.actuals.BIM_Activity_Start, 0); 
      rowValues[23] = getVal(item.actuals.BIM_Activity_End, 1000);
      rowValues[24] = getVal(item.actuals["BIM_Execution_Percent"], "N/A");
      rowValues[25] = getVal(item.actuals.BIM_Chapter, "N/A");
      rowValues[26] = getVal(item.actuals.BIM_Measurement, "N/A");
      rowValues[27] = getVal(item.actuals.BIM_Partida, "N/A");
      
      // Auto-completed Measurement Unit column (28)
      rowValues[28] = classUnit; 
      rowColors[28] = (classUnit === "N/A") ? COLOR_CONTEXT : COLOR_VALID;
      
      rowValues[29] = getVal(item.actuals.BIM_Doc1, "N/A");
      rowValues[30] = getVal(item.actuals.BIM_Doc2, "N/A");

      // Initial Diagnostics / Validation Rules
      if (valProdDesc === "") errorList.push("Missing Product Description");
      else if (finalCode === "N/A") errorList.push("Description not found in Master DB");
      if (valZoning === "") errorList.push("Missing Zoning");
      if (valStatus === "") errorList.push("Missing Status");

      rowValues[31] = errorList.length > 0 ? errorList.join(" | ") : "OK";
      rowColors[31] = errorList.length > 0 ? COLOR_WARNING : COLOR_VALID;

      allRows.push(rowValues);
      allColors.push(rowColors);
    }

    if (allRows.length > 0) {
      sheet.clear();
      var headers = [
        "Model GUID", "Element GUID", "Unique ID", "Family", "Type", 
        "BIM_Product_Code", "BIM_Product_Description", "BIM_Discipline", "BIM_Subdiscipline", "BIM_Zonification", 
        "BIM_Status_Code", "BIM_Study_Code", "BIM_Status_Description", "BIM_Definition_Source", "BIM_Km_Start", 
        "BIM_Km_End", "BIM_Object_ID", "BIM_Relocation_Code", "BIM_Comment_Source", "BIM_Temp_Visibility", 
        "BIM_Activity_Code", "BIM_Phase", "BIM_Activity_Start", "BIM_Activity_End", "BIM_Execution_Percent", 
        "BIM_Chapter", "BIM_Measurement", "BIM_Partida", "BIM_Unit", "BIM_Doc1", 
        "BIM_Doc2", "ERROR_DIAGNOSIS"
      ];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, 32).setFontWeight("bold").setBackground(COLOR_HEADER).setFontColor("white");
      sheet.setFrozenRows(1);
      sheet.getRange(2, 1, allRows.length, 32).setValues(allRows).setBackgrounds(allColors);
      sheet.getRange(2, 20, allRows.length, 1).insertCheckboxes();
      updateDashboard("Dynamo Export");
    }
    
    var targetUrl = ss.getUrl() + "#gid=" + sheet.getSheetId();
    return ContentService.createTextOutput("SUCCESS - Link: " + targetUrl);

  } catch(e) { 
    return ContentService.createTextOutput("❌ ERROR: " + e.message); 
  }
}

// Find a row matching value in column index
function findExactRow(searchVal, matrix, colIndex) {
  if (!searchVal || searchVal === "N/A" || searchVal === "") return [];
  var cleanSearch = String(searchVal).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  for (var i = 1; i < matrix.length; i++) {
    if (!matrix[i] || matrix[i][colIndex] == null) continue;
    var currentVal = String(matrix[i][colIndex]).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (currentVal === cleanSearch) return matrix[i]; 
  }
  return [];
}

// ============================================================================
// 2. CURATION / MAINTENANCE MODULE
// ============================================================================
function curateAndValidateData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var r = sheet.getDataRange();
  var v = r.getValues();
  var b = r.getBackgrounds();
  
  var ssRef = SpreadsheetApp.openByUrl(MASTER_DB_URL);
  var masterClassification = ssRef.getSheetByName("VAL_CLASSIFICATION").getDataRange().getValues();
  var masterAttributes01  = ssRef.getSheetByName("VAL_ATRIBUTOS_01").getDataRange().getValues();
  var masterZoning        = ssRef.getSheetByName("VAL_ZONING").getDataRange().getValues();
  var masterAttributes03  = ssRef.getSheetByName("VAL_ATRIBUTOS_03").getDataRange().getValues();

  var changesCount = 0;
  for (var i = 1; i < v.length; i++) {
    var valProdDesc = String(v[i][6]).trim();
    var valZoning   = String(v[i][9]).trim();
    var valStatus   = String(v[i][12]).trim();
    
    var rowClass = findExactRow(valProdDesc, masterClassification, IDX_CLASS_DESC);
    var classCode = rowClass[IDX_CLASS_CODE] || "N/A";
    var classUnit = rowClass[IDX_CLASS_UNIT] || "N/A";

    var rowAttr = findExactRow(classCode !== "N/A" ? classCode : valProdDesc, masterAttributes01, classCode !== "N/A" ? IDX_ATTR_CODE : IDX_ATTR_DESC);
    var rowZone = findExactRow(valZoning, masterZoning, IDX_ZONE_CODE);
    var rowStatus = findExactRow(valStatus, masterAttributes03, IDX_STATUS_DESC);

    v[i][5] = classCode; 
    b[i][5] = (classCode === "N/A") ? COLOR_WARNING : COLOR_VALID;

    var expected = { 
        7:  { val: rowAttr[IDX_ATTR_DISC] || "", num: false }, 
        8:  { val: rowAttr[IDX_ATTR_SUBD] || "", num: false }, 
        10: { val: rowStatus[IDX_STATUS_CODE] || "", num: false },
        11: { val: rowAttr[IDX_ATTR_STUDY] || "", num: false },  
        14: { val: (rowZone.length > 2) ? rowZone[2] : "", num: true }, 
        15: { val: (rowZone.length > 3) ? rowZone[3] : "", num: true },
        28: { val: classUnit, num: false } 
    };

    [7,8,10,11,14,15,28].forEach(function(col) {
      if (expected[col].val !== "" && String(v[i][col]).trim() !== String(expected[col].val).trim()) {
          v[i][col] = expected[col].val; 
          b[i][col] = COLOR_VALID; 
          changesCount++;
      }
    });

    if (v[i][19] !== true && v[i][19] !== "TRUE") { 
      v[i][19] = true; 
      b[i][19] = COLOR_VALID; 
      changesCount++; 
    }

    // Re-evaluate error diagnosis after curation
    var errors = [];
    if (valProdDesc === "") errors.push("Missing Product Description");
    else if (classCode === "N/A") errors.push("Description not found in Master DB");
    if (valZoning === "") errors.push("Missing Zoning");
    if (valStatus === "") errors.push("Missing Status");

    v[i][31] = errors.length > 0 ? errors.join(" | ") : "OK";
    b[i][31] = errors.length > 0 ? COLOR_WARNING : COLOR_VALID;
  }
  
  if (changesCount > 0) { 
    r.setValues(v).setBackgrounds(b); 
    updateDashboard("Manual Curation");
    SpreadsheetApp.getUi().alert("✅ Data Curation & Validation Completed. Changes applied: " + changesCount);
  } else {
    SpreadsheetApp.getUi().alert("ℹ️ No discrepancies found. Data is already up to date.");
  }
}

// ============================================================================
// 3. DASHBOARD MODULE
// ============================================================================
function initDashboardSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("📈 AUDIT DASHBOARD") || ss.insertSheet("📈 AUDIT DASHBOARD", 0); 
  sheet.clear();
  sheet.setHiddenGridlines(true);
  
  sheet.getRange("A1:M2").merge()
       .setValue("📊 BIM DATA AUDIT DASHBOARD")
       .setFontSize(18)
       .setFontWeight("bold")
       .setFontColor("white")
       .setBackground("#3e5f7c")
       .setHorizontalAlignment("center")
       .setVerticalAlignment("middle");
       
  sheet.getRange("A5:E5").setValues([["Sheet / Model Name", "Total Elements", "✅ Validated (OK)", "⚠️ To Review", "Success Rate"]])
       .setFontWeight("bold")
       .setBackground("#efefef")
       .setHorizontalAlignment("center");
       
  sheet.getRange("A41:G41").setValues([["Timestamp", "Audit Action Details", "Source", "", "", "", ""]])
       .setFontWeight("bold")
       .setBackground("#efefef");
       
  return sheet;
}

function updateDashboard(logType) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dash = initDashboardSheet();
  var sheets = ss.getSheets();
  var dashboardData = [];
  var totalElements = 0, totalOK = 0, totalReview = 0;

  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    if (s.getName().indexOf("_AUDIT_") === -1) continue;
    var lr = s.getLastRow();
    if (lr < 2) continue;
    var vals = s.getRange(2, 32, lr-1, 1).getValues();
    var okCount = 0; 
    for (var j = 0; j < vals.length; j++) {
      if (vals[j][0] === "OK") okCount++;
    }
    var reviewCount = vals.length - okCount;
    dashboardData.push([s.getName(), vals.length, okCount, reviewCount, okCount/vals.length]);
    totalElements += vals.length; 
    totalOK += okCount; 
    totalReview += reviewCount;
  }

  if (dashboardData.length > 0) {
    dashboardData.unshift(["GLOBAL TOTAL", totalElements, totalOK, totalReview, totalOK/totalElements]);
    var dr = dash.getRange(6, 1, dashboardData.length, 5);
    dr.setValues(dashboardData).setHorizontalAlignment("center").setBorder(true,true,true,true,true,true);
    dash.getRange(6, 5, dashboardData.length, 1).setNumberFormat("0%");
    
    // Render chart
    var chart = dash.newChart()
                    .asBarChart()
                    .addRange(dash.getRange(6,1,dashboardData.length,1))
                    .addRange(dash.getRange(6,3,dashboardData.length,2))
                    .setOption('isStacked', true)
                    .setOption('colors', ['#5ca06c', '#d96c6c'])
                    .setOption('title', 'Validation State by Model')
                    .setPosition(4, 7, 0, 0)
                    .setOption('width', 600)
                    .build();
    dash.insertChart(chart);
  }
  addLogEntry(logType);
}

function addLogEntry(type) {
  var dash = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("📈 AUDIT DASHBOARD");
  if (!dash) return;
  dash.insertRowAfter(41);
  dash.getRange(42, 1, 1, 3).setValues([[new Date(), type, "Dynamo/GSheets"]]).setHorizontalAlignment("center");
}
