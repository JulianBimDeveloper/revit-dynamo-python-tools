/**
 * BIM Project Information Audit Dashboard - Google Apps Script
 * Receives exported Project Information parameters from Revit via Dynamo,
 * cross-references them against a master database sheet, flags discrepancies,
 * and maintains a log history on an audit dashboard.
 * 
 * Master Spreadsheet Configuration Requirements:
 * Must contain a sheet named:
 * 1. "VAL_ATRIBUTOS_05" (Contains standard project parameters mapped to project codes)
 */

// URL of the Master Database spreadsheet
var MASTER_DB_URL = "https://docs.google.com/spreadsheets/d/YOUR_MASTER_DATABASE_SPREADSHEET_ID/edit";

// Default standard project code to check in the database
var MASTER_PROJECT_CODE = "PRJ-001"; 

// Parameter Mapping: Maps Revit parameter names (Spanish templates supported) to database columns
var PARAMETER_MAPPING = {
    "Número de proyecto": "BIM_Project_Number",
    "Nombre de proyecto": "BIM_Project_Name",
    "Nombre del edificio": "BIM_Building_Name",
    "Nombre de cliente": "BIM_Client_Name",
    "Estado de proyecto": "BIM_Project_Status",
    "Dirección de proyecto": "BIM_Project_Address",
    "Nombre de organización": "BIM_Organization_Name",
    "Descripción de organización": "BIM_Organization_Description",
    "Autor": "BIM_Author"
};

// Parameters to skip auditing
var IGNORED_PARAMETERS = [
    "IfcBuilding GUID", "IfcProject GUID", "IfcSite GUID", "Subproyecto", "Configuración de análisis de ruta"
];

function normalizeString(text) {
    return String(text).replace(/[\n\r\s_]/g, "").toLowerCase();
}

// ==============================================================================
// 1. SHEETS MENU
// ==============================================================================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🛠️ BIM Project Audit')
    .addItem('🔄 Revalidate Current Sheet', 'revalidateCurrentSheetManual')
    .addItem('📊 Update Global Dashboard', 'updateDashboardManual')
    .addToUi();
}

function updateDashboardManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  updateDashboard("Manual Update (Menu)", ss);
  SpreadsheetApp.getUi().alert("✅ Dashboard Updated", "The global summary dashboard has been re-calculated.", SpreadsheetApp.getUi().ButtonSet.OK);
}

// ==============================================================================
// 2. MANUAL REVALIDATION
// ==============================================================================
function revalidateCurrentSheetManual() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var ui = SpreadsheetApp.getUi();
  
  if (sheet.getName().indexOf("_INFO_") === -1) {
      ui.alert("⚠️ Warning", "This sheet does not appear to be a valid Revit Project Information audit sheet.", ui.ButtonSet.OK);
      return;
  }
  
  var lr = sheet.getLastRow();
  if (lr < 5) return; 
  
  var masterRow = null;
  var masterHeaders = [];
  try {
      var ssMaster = SpreadsheetApp.openByUrl(MASTER_DB_URL);
      var sheetMaster = ssMaster.getSheetByName("VAL_ATRIBUTOS_05");
      var masterData = sheetMaster.getDataRange().getValues();
      masterHeaders = masterData[0]; 
      
      var colSearch = -1;
      for (var c = 0; c < masterHeaders.length; c++) {
          if (normalizeString(masterHeaders[c]) === normalizeString("BIM_Project_Code")) {
              colSearch = c; break;
          }
      }
      if (colSearch !== -1) {
          for (var m = 1; m < masterData.length; m++) {
              if (String(masterData[m][colSearch]).trim() === MASTER_PROJECT_CODE) {
                  masterRow = masterData[m]; break;
              }
          }
      }
  } catch(e) {
      ui.alert("❌ Error", "Could not connect to the Master Database spreadsheet.", ui.ButtonSet.OK);
      return;
  }
  
  if (!masterRow) {
      ui.alert("❌ Error", "Standard code '" + MASTER_PROJECT_CODE + "' not found in the database.", ui.ButtonSet.OK);
      return;
  }

  var rangeData = sheet.getRange(5, 1, lr - 4, 3);
  var values = rangeData.getValues();
  var backgrounds = rangeData.getBackgrounds();
  var fontColors = rangeData.getFontColors();
  
  var fn = sheet.getRange(2, 2).getValue(); 
  var expectedIssueDate = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "dd/MM/yyyy");
  var changesCount = 0;

  for (var i = 0; i < values.length; i++) {
      var paramName = values[i][0];
      var currentValue = String(values[i][1]).trim();
      var currentDiag = String(values[i][2]);
      
      // Skip read-only, headers or ignored parameters
      if (backgrounds[i][0] === "#a4c2f4" || backgrounds[i][1] === "#efefef" || IGNORED_PARAMETERS.indexOf(paramName) !== -1) continue;
      
      var searchName = PARAMETER_MAPPING[paramName] || paramName;
      var normSearch = normalizeString(searchName);
      var colIdx = -1;
      
      for (var c = 0; c < masterHeaders.length; c++) {
          if (normalizeString(masterHeaders[c]) === normSearch) { colIdx = c; break; }
      }
      
      var expectedValue = null;
      if (paramName === "BIM_File_Code" || paramName === "BIM_Codigo_Archivo") {
          expectedValue = String(fn).endsWith(".rvt") ? fn : fn + ".rvt";
      } else if (paramName === "Fecha de emisión de proyecto" || paramName === "Project Issue Date") {
          expectedValue = expectedIssueDate;
      } else if (colIdx !== -1) {
          var rawExpected = String(masterRow[colIdx]).trim();
          if (rawExpected !== "") expectedValue = rawExpected;
      }
      
      if (expectedValue !== null) {
          if (currentValue !== expectedValue && currentDiag.indexOf("Rewritten") === -1) {
              values[i][1] = expectedValue;
              values[i][2] = "🔄 Rewritten (Revit value was: '" + currentValue + "')";
              backgrounds[i][2] = "#fff2cc"; // Orange/Yellow alert
              fontColors[i][2] = "#b45f06";
              changesCount++;
          } 
          else if (currentValue === expectedValue && currentDiag.indexOf("OK") === -1 && currentDiag.indexOf("Rewritten") === -1) {
              values[i][2] = "✅ OK (Matching DB)";
              backgrounds[i][2] = "#d9ead3"; // Valid green
              fontColors[i][2] = "#274e13";
              changesCount++;
          }
      }
  }
  
  if (changesCount > 0) {
      rangeData.setValues(values);
      rangeData.setBackgrounds(backgrounds);
      rangeData.setFontColors(fontColors);
      sheet.getRange(1, 2).setValue(Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss"));
  }
  
  updateDashboard("Sheet Manual Revalidation", ss);
  if (changesCount > 0) {
      ui.alert("✅ Revalidation Completed", "Detected and updated " + changesCount + " inconsistent parameter values.", ui.ButtonSet.OK);
  } else {
      ui.alert("✅ Up to date", "No parameter discrepancies found.", ui.ButtonSet.OK);
  }
}

// ==============================================================================
// 3. DYNAMO EXPORT RECEIVER (POST Webhook)
// ==============================================================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput("ERROR: Empty body.");
    }
    
    var data = JSON.parse(e.postData.contents)[0]; 
    
    // Connect to dynamic sheet URL if provided, otherwise active spreadsheet
    var targetSpreadsheetUrl = data.targetSpreadsheetUrl;
    var ss;
    if (targetSpreadsheetUrl && targetSpreadsheetUrl !== "") {
      ss = SpreadsheetApp.openByUrl(targetSpreadsheetUrl);
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    var fn = data.Document_Name || "Model";
    var p = fn.split('-');
    var sheetName = (p[4] || "GEN") + "_INFO_" + (fn.split('_').pop().replace('.rvt','')).toUpperCase();
    
    var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    
    var dateToday = new Date();
    var exportTimestamp = Utilities.formatDate(dateToday, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
    var expectedIssueDate = Utilities.formatDate(dateToday, ss.getSpreadsheetTimeZone(), "dd/MM/yyyy");
    
    var params = data.parameters;

    var masterRow = null;
    var masterHeaders = [];
    var headerBackgrounds = [];
    var headerFontColors = [];

    // Query Master Database for values
    try {
        var ssMaster = SpreadsheetApp.openByUrl(MASTER_DB_URL);
        var sheetMaster = ssMaster.getSheetByName("VAL_ATRIBUTOS_05");
        var rangeMaster = sheetMaster.getDataRange();
        var masterData = rangeMaster.getValues();
        masterHeaders = masterData[0]; 
        
        var headerRange = sheetMaster.getRange(1, 1, 1, masterHeaders.length);
        headerBackgrounds = headerRange.getBackgrounds()[0];
        headerFontColors = headerRange.getFontColors()[0];
        
        var colSearch = -1;
        for (var c = 0; c < masterHeaders.length; c++) {
            if (normalizeString(masterHeaders[c]) === normalizeString("BIM_Project_Code")) {
                colSearch = c; break;
            }
        }
        if (colSearch !== -1) {
            for (var m = 1; m < masterData.length; m++) {
                if (String(masterData[m][colSearch]).trim() === MASTER_PROJECT_CODE) {
                    masterRow = masterData[m]; break;
                }
            }
        }
    } catch(errMaster) {
        console.error("Master DB lookup failed: " + errMaster);
    }

    var outputArray = [];
    var backgrounds = []; 
    var fontWeights = [];
    var fontColors = [];
    
    // Rows 1-3: System Metadata
    outputArray.push(["Last Update Timestamp", exportTimestamp, ""]);
    backgrounds.push(["#e69138", "#e69138", "#e69138"]); fontWeights.push(["bold", "bold", "bold"]); fontColors.push(["white", "white", "white"]);
    
    outputArray.push(["Document Name", fn, ""]);
    backgrounds.push(["#3e5f7c", "#efefef", "#efefef"]); fontWeights.push(["bold", "bold", "bold"]); fontColors.push(["white", "black", "black"]);

    outputArray.push(["Element ID (For Importing)", data.Project_Info_Id || "N/A", ""]);
    backgrounds.push(["#3e5f7c", "#efefef", "#efefef"]); fontWeights.push(["bold", "bold", "bold"]); fontColors.push(["white", "black", "black"]);

    // Row 4: Column Headers
    outputArray.push(["PARAMETER NAME", "VALUE IN REVIT (OVERWRITTEN IF AUDIT FAILS)", "AUDIT DIAGNOSIS (STANDARD " + MASTER_PROJECT_CODE + ")"]);
    backgrounds.push(["#444444", "#444444", "#444444"]); fontWeights.push(["bold", "bold", "bold"]); fontColors.push(["white", "white", "white"]);

    // Sort parameters alphabetically by group name and then by parameter name
    params.sort(function(a, b) { 
        if (a.group === b.group) return a.name.localeCompare(b.name);
        return a.group.localeCompare(b.group); 
    });
    
    var currentGroup = "";
    
    // Rows 5+: Parameters
    for (var i = 0; i < params.length; i++) {
        var pr = params[i];
        
        if (IGNORED_PARAMETERS.indexOf(pr.name) !== -1) pr.is_readonly = true;

        // Add group separator row if group changes
        if (pr.group !== currentGroup) {
            currentGroup = pr.group;
            outputArray.push([currentGroup, "", ""]);
            backgrounds.push(["#a4c2f4", "#a4c2f4", "#a4c2f4"]); fontWeights.push(["bold", "bold", "bold"]); fontColors.push(["black", "black", "black"]);
        }
        
        var searchName = PARAMETER_MAPPING[pr.name] || pr.name;
        var normSearch = normalizeString(searchName);
        
        var colIdx = -1;
        for (var c = 0; c < masterHeaders.length; c++) {
            if (normalizeString(masterHeaders[c]) === normSearch) { colIdx = c; break; }
        }
        
        var paramBgColor = (colIdx !== -1 && headerBackgrounds[colIdx]) ? headerBackgrounds[colIdx] : "#3e5f7c";
        var paramTxtColor = (colIdx !== -1 && headerFontColors[colIdx]) ? headerFontColors[colIdx] : "#ffffff";
        
        var valRevit = String(pr.value).trim();
        var valFinal = valRevit; 
        
        var diagText = "➖"; 
        var diagColor = "#ffffff";
        var diagFontColor = "#999999";

        if (pr.is_readonly) {
            diagText = "";
            diagColor = "#efefef";
            diagFontColor = "#000000";
        } 
        else {
            var expectedValue = null;

            if (pr.name === "BIM_File_Code" || pr.name === "BIM_Codigo_Archivo" || pr.name === "ADIF_00_Codigo_Archivo") {
                expectedValue = String(fn).endsWith(".rvt") ? fn : fn + ".rvt";
            } else if (pr.name === "Fecha de emisión de proyecto" || pr.name === "Project Issue Date") {
                expectedValue = expectedIssueDate;
            } else if (colIdx !== -1 && masterRow) {
                var rawExpected = String(masterRow[colIdx]).trim();
                if (rawExpected !== "") expectedValue = rawExpected;
            }

            if (expectedValue !== null) {
                if (valRevit === expectedValue) {
                    diagText = "✅ OK (Matching DB)";
                    diagColor = "#d9ead3"; 
                    diagFontColor = "#274e13";
                    valFinal = valRevit;
                } else {
                    diagText = "🔄 Rewritten (Revit value was: '" + valRevit + "')";
                    diagColor = "#fff2cc"; 
                    diagFontColor = "#b45f06";
                    valFinal = expectedValue; 
                }
            }
        }

        var cellRevitColor = pr.is_readonly ? "#efefef" : "#ffffff";

        outputArray.push([pr.name, valFinal, diagText]); 
        backgrounds.push([paramBgColor, cellRevitColor, diagColor]); 
        fontWeights.push(["bold", "normal", "bold"]);
        fontColors.push([paramTxtColor, "black", diagFontColor]);
    }
    
    sheet.clear();
    
    var range = sheet.getRange(1, 1, outputArray.length, 3);
    range.setValues(outputArray);
    range.setBackgrounds(backgrounds);
    range.setFontWeights(fontWeights);
    range.setFontColors(fontColors);
    
    sheet.getRange(1, 2, 3, 2).mergeAcross();
    for (var r = 0; r < outputArray.length; r++) {
      if (backgrounds[r][0] === "#a4c2f4") sheet.getRange(r + 1, 1, 1, 3).mergeAcross();
    }
    
    range.setBorder(true, true, true, true, true, true, "#cccccc", SpreadsheetApp.BorderStyle.SOLID);
    range.setVerticalAlignment("middle");
    
    sheet.setColumnWidth(1, 350);
    sheet.setColumnWidth(2, 400);
    sheet.setColumnWidth(3, 400);
    
    updateDashboard("Dynamo Export (Project Info)", ss);
    
    return ContentService.createTextOutput("✅ SUCCESS: Project Info Export completed.");

  } catch(err) {
    return ContentService.createTextOutput("❌ ERROR in Apps Script Server: " + err.message);
  }
}


// ==============================================================================
// 4. AUDIT DASHBOARD MODULE
// ==============================================================================
var DASHBOARD_SHEET_NAME = "📈 AUDIT DASHBOARD"; 
var H_DASH_TITLE = "#3e5f7c"; 
var H_BASE = "#6b8eac";
var C_LOG_BG = "#f9f9f9";      
var C_DASH_GREEN = "#d9ead3"; 
var C_DASH_RED = "#fce8e6";   

function initDashboardSheet(ss) {
  var sheet = ss.getSheetByName(DASHBOARD_SHEET_NAME) || ss.insertSheet(DASHBOARD_SHEET_NAME, 0); 
  
  // Clean old charts to keep spreadsheet lightweight
  var charts = sheet.getCharts();
  for (var i = 0; i < charts.length; i++) {
    sheet.removeChart(charts[i]);
  }
  
  sheet.clear();
  sheet.setHiddenGridlines(true); 
  
  var titleCell = sheet.getRange("A1:M2"); 
  titleCell.merge().setValue("📊 PANEL DE RESUMEN DE GESTIÓN DE PARÁMETROS")
           .setFontSize(18).setFontWeight("bold").setFontColor("white")
           .setBackground(H_DASH_TITLE).setVerticalAlignment("middle").setHorizontalAlignment("center");
  
  sheet.getRange("A4").setValue("📋 SUMMARY DETAILS").setFontSize(12).setFontWeight("bold");
  sheet.getRange("A4:E4").merge().setHorizontalAlignment("center").setFontColor("white").setBackground(H_BASE).setVerticalAlignment("middle");
  sheet.getRange("A5:E5").setValues([["Sheet / Model Name", "Total Elements", "✅ Validated (OK)", "⚠️ To Review", "Success Rate"]]).setFontWeight("bold").setBackground("#efefef").setHorizontalAlignment("center");

  sheet.getRange("A40").setValue("🕒 RECENT ACTIVITY HISTORY").setFontSize(12).setFontWeight("bold");
  sheet.getRange("A40:G40").merge().setHorizontalAlignment("center").setFontColor("white").setBackground(H_BASE).setVerticalAlignment("middle");
  sheet.getRange("A41:G41").setValues([["Timestamp", "Audit Action Details", "Source", "", "", "", ""]]).setFontWeight("bold").setBackground("#efefef").setHorizontalAlignment("center");
  
  sheet.setRowHeight(4, 30);
  sheet.setRowHeight(40, 30);
  sheet.setColumnWidth(1, 300); 
  sheet.setColumnWidth(7, 20);  
  
  return sheet;
}

function updateDashboard(logType, ss) {
  try {
    var dashSheet = initDashboardSheet(ss); 
    var allSheets = ss.getSheets();
    
    var dataHojas = [];
    var totalGGlobal = 0, totalOKGlobal = 0, totalREVGlobal = 0;
    
    // Scan all sheets representing Revit models
    for(var i = 0; i < allSheets.length; i++) {
      var sheet = allSheets[i];
      var name = sheet.getName();
      
      if(name.indexOf("_INFO_") === -1) continue; 
      
      var lr = sheet.getLastRow();
      if(lr < 5) continue; 
      
      // Column C (index 3) is the Audit Diagnosis output
      var diagRange = sheet.getRange(5, 3, lr - 4, 1);
      var diagValues = diagRange.getValues();
      
      var countOK = 0; 
      var countREV = 0;
      
      for(var r = 0; r < diagValues.length; r++) {
        var val = String(diagValues[r][0]);
        
        if(val.indexOf("✅") !== -1) { 
            countOK++; 
        } else if(val.indexOf("❌") !== -1 || val.indexOf("🔄") !== -1 || val.indexOf("⚠️") !== -1) { 
            countREV++; 
        }
      }
      
      var totalAudited = countOK + countREV;
      if (totalAudited > 0) {
          var pctOk = countOK / totalAudited;
          dataHojas.push([name, totalAudited, countOK, countREV, pctOk]);
          totalGGlobal += totalAudited; 
          totalOKGlobal += countOK; 
          totalREVGlobal += countREV;
      }
    }
    
    if(dataHojas.length > 0) {
      var dataWriting = dataHojas.slice(); 
      var pctOkGlobal = (totalGGlobal > 0) ? (totalOKGlobal / totalGGlobal) : 0;
      dataWriting.unshift(["GLOBAL TOTAL", totalGGlobal, totalOKGlobal, totalREVGlobal, pctOkGlobal]);
      
      var dataRange = dashSheet.getRange(6, 1, dataWriting.length, 5);
      dataRange.setValues(dataWriting);
      
      dataRange.setBorder(true, true, true, true, true, true, "#d0d0d0", SpreadsheetApp.BorderStyle.SOLID);
      dataRange.setHorizontalAlignment("center").setVerticalAlignment("middle");
      dashSheet.getRange(6, 1, dataWriting.length, 1).setHorizontalAlignment("left").setFontWeight("bold"); 
      
      dashSheet.getRange(6, 3, dataWriting.length, 1).setBackground(C_DASH_GREEN); 
      dashSheet.getRange(6, 4, dataWriting.length, 1).setBackground(C_DASH_RED);  
      dashSheet.getRange(6, 5, dataWriting.length, 1).setNumberFormat("0%");
      dashSheet.getRange(6, 1, 1, 5).setFontWeight("bold").setBackground("#e6ecef");

      // Setup Chart ranges
      var rangeLabels = dashSheet.getRange(6, 1, dataHojas.length + 1, 1); 
      var rangeOKs = dashSheet.getRange(6, 3, dataHojas.length + 1, 1);    
      var rangeREVs = dashSheet.getRange(6, 4, dataHojas.length + 1, 1);   
      
      var chartBuilder = dashSheet.newChart().asBarChart(); 
      chartBuilder.addRange(rangeLabels);
      chartBuilder.addRange(rangeOKs);
      chartBuilder.addRange(rangeREVs);
      
      chartBuilder.setOption('isStacked', true);
      chartBuilder.setOption('colors', ['#5ca06c', '#d96c6c']); 
      chartBuilder.setOption('title', 'Audit Status by Project Info Model');
      chartBuilder.setOption('titleTextStyle', {fontSize: 14, bold: true, color: '#333333'});
      chartBuilder.setOption('legend', {position: 'top'});
      chartBuilder.setOption('hAxis', {title: 'Audited Parameters', textStyle: {color: '#666666'}});
      chartBuilder.setOption('vAxis', {textStyle: {fontSize: 11, bold: true, color: '#444444'}});
      chartBuilder.setOption('backgroundColor', '#ffffff');
      
      var chartHeight = Math.max(350, (dataHojas.length * 40) + 100); 
      chartBuilder.setOption('chartArea', {left: '30%', top: '15%', width: '65%', height: '70%'});
      
      chartBuilder.setOption('width', 750);
      chartBuilder.setOption('height', chartHeight);
      chartBuilder.setPosition(4, 7, 0, 0); 
      
      dashSheet.insertChart(chartBuilder.build());
      
    } else {
      dashSheet.getRange("A6").setValue("⚠️ No model sheets audited yet.").setFontWeight("bold");
    }

    addLogEntry(logType, ss);
    SpreadsheetApp.flush();
    
  } catch (error) {
    console.error("Dashboard failed to update: " + error.message);
  }
}

function addLogEntry(type, ss) {
  var dashSheet = ss.getSheetByName(DASHBOARD_SHEET_NAME);
  if(!dashSheet) return; 

  var logHeaderRow = 41; 
  var firstDataRow = 42; 
  var maxLogs = 15; 
  
  dashSheet.insertRowAfter(logHeaderRow);
  
  var timestamp = new Date();
  var formattedDate = Utilities.formatDate(timestamp, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd HH:mm:ss");
  var logEntry = [formattedDate, type, "Automated Audit System", "", "", "", ""];
  
  var rowRange = dashSheet.getRange(firstDataRow, 1, 1, 7);
  rowRange.setValues([logEntry]);
  rowRange.setBackground(C_LOG_BG).setBorder(true, true, true, true, true, true, "#d0d0d0", SpreadsheetApp.BorderStyle.SOLID);
  rowRange.setFontWeight("normal").setHorizontalAlignment("center").setVerticalAlignment("middle"); 
  
  var currentLastRow = dashSheet.getLastRow();
  if (currentLastRow > firstDataRow + maxLogs) {
    dashSheet.deleteRow(currentLastRow);
  }
}
