// XlFileFormat
var xlExcel9795 = 43; //.xls 97-2003 format in Excel 2003 or prev
var xlExcel8    = 56; //.xls 97-2003 format in Excel 2007
var xlOpenXMLWorkbookMacroEnabled = 52; //.xlsm

// AcNewDatabaseFormat
var acNewDatabaseFormatAccess2000 =  9; //.mdb
var acNewDatabaseFormatAccess2002 = 10; //.mdb
var acNewDatabaseFormatAccess2007 = 12; //.accdb

var vbext_ct_StdModule   = 1;
var vbext_ct_ClassModule = 2;
var vbext_ct_MSForm      = 3;
var vbext_ct_Document    = 100;

// AcSysCmdAction
var acSysCmdAccessVer = 7;

// AcObjectType
var acTable  = 0;
var acQuery  = 1;
var acForm   = 2;
var acReport = 3;
var acMacro  = 4;
var acModule = 5;

var fso = WScript.CreateObject("Scripting.FileSystemObject");

var scriptPath = WScript.ScriptFullName;

var args = (function () {
    var a = new Array(WScript.Arguments.length);
    for (var i = 0; i < a.length; i++) a[i] = WScript.Arguments.item(i);
    return a;
}());

var println = function(str) {
    WScript.Echo(str);
};

var foreachEnum = function(collection, callback) {
    for ( var xs=new Enumerator(collection), x=xs.item(), i=0;
          !xs.atEnd();
          xs.moveNext(), x=xs.item(), i++
        ) {
        
        if (!!callback(x, i)) break;
    }
}

var dateTimeString = function(dt) {
    var g = function(y) { return (y < 2000) ? 1900 + y : y; };
    var f = function(n) { return (n < 10) ? "0" + n : n.toString(); };
    return g(dt.getYear())  + f(dt.getMonth() + 1) + f(dt.getDate())
         + f(dt.getHours()) + f(dt.getMinutes())   + f(dt.getSeconds());
};

var Config = function() {
    this.root = fso.GetParentFolderName(scriptPath);
    this.bin  = fso.BuildPath(this.root, 'bin');
    this.src  = fso.BuildPath(this.root, 'src');
};
Config.prototype.getBins = function() { return fso.GetFolder(this.bin).Files; };
Config.prototype.getSrcs = function() { return fso.GetFolder(this.src).SubFolders; };

var conf = new Config();

var Office = function() {};
Office.prototype.isDirectiveOnly = function(codeModule) {
    var ml = codeModule.CountOfLines;
    var dl = codeModule.CountOfDeclarationLines;
    if (ml > dl) return false;
    if (ml < 1)  return true;
    for (var i=0,arr=codeModule.Lines(1, dl).split("\r\n"),len=arr.length; i<len; i++) {
        var s = arr[i].replace(/^\s+|\s+$/g, "");
        if (s != "" && s.charAt(0).toLowerCase() != "o") return false;
    }
    return true;
};
Office.prototype.combine   = function() { /* blank */ };
Office.prototype.decombine = function() { /* blank */ };
Office.prototype.clear     = function() { /* blank */ };

var Excel = function() {};
Excel.prototype = new Office();
Excel.prototype.createOpenFile = function(xlApp, path) {
    var xlFileFormat;
    var vernum = parseInt(xlApp.Version);
    switch (fso.GetExtensionName(path)) {
    case 'xls':  xlFileFormat = xlExcel9795;
                 break;
    case 'xlsm': xlFileFormat = xlOpenXMLWorkbookMacroEnabled;
                 break;
    default:     xlFileFormat = (vernum < 12) ? xlExcel9795 : xlOpenXMLWorkbookMacroEnabled;
                 path        += (vernum < 12) ? '.xls'      : '.xlsm';
                 break;
    }
    
    var xlBook;
    try {
        if (fso.FileExists(path)) {
            xlBook = xlApp.Workbooks.Open(path);
        }
        else {
            xlBook = xlApp.Workbooks.Add();
            xlBook.SaveAs(path, xlFileFormat);
        }
    }
    catch (ex) {
        if (xlBook != null) xlBook.Close();
        throw ex;
    }
    return xlBook;
};
Excel.prototype.loanOfXlBook = function(path, isCreate, callback) {
    var xlApp, xlBook, ret;
    
    try {
        xlApp = new ActiveXObject("Excel.Application");
        xlApp.DisplayAlerts = false;
        xlApp.EnableEvents  = false;
    try {
        xlBook = (isCreate) ? this.createOpenFile(xlApp, path) : xlApp.Workbooks.Open(path);;
        this.checkExcelMacroSecurity(xlBook);
        
        ret = callback(xlBook);
    } finally { if (xlBook != null) xlBook.Close(); }
    } finally { if (xlApp  != null) xlApp.Quit();   }
    
    return ret;
};
Excel.prototype.checkExcelMacroSecurity = function(xlBook) {
    try {
        xlBook.VBProject;
    }
    catch (ex) {
        if (ex.number == -2146827284)
            ex.description = [ex.description, "See also http://support.microsoft.com/kb/813969"].join("\n");
        throw ex;
    }
};
Excel.prototype.extensionTypeTable = {
    'bas': vbext_ct_StdModule, 'cls': vbext_ct_ClassModule,
    'frm': vbext_ct_MSForm,    'frx': vbext_ct_MSForm,
    'dcm': vbext_ct_Document
};
Excel.prototype.typeExtensionTable = {};
Excel.prototype.typeExtensionTable[vbext_ct_StdModule]   = 'bas';
Excel.prototype.typeExtensionTable[vbext_ct_ClassModule] = 'cls';
Excel.prototype.typeExtensionTable[vbext_ct_MSForm]      = 'frm'; // with 'frx'
Excel.prototype.typeExtensionTable[vbext_ct_Document]    = 'dcm';
Excel.prototype.cleanupBinary = function(xlBook, verbose) {
    var compos = xlBook.VBProject.VBComponents;
    var self   = this;
    foreachEnum(compos, function(c) {
        if (self.isDirectiveOnly(c.CodeModule)) return false;
        
        var bname = c.Name;
        if (c.Type == vbext_ct_Document)
            c.CodeModule.DeleteLines(1, c.CodeModule.CountOfLines);
        else
            compos.Remove(c);
        if (!!verbose)
            println("- Cleanup: " + bname);
    });
};
Excel.prototype.cleanupSource = function(dir, verbose) {
    if (!fso.FolderExists(dir)) {
         fso.CreateFolder(dir);
         return;
    }
    
    var self = this;
    foreachEnum(fso.GetFolder(dir).Files, function(fl) {
        var fname = fso.GetFileName(fl.Path);
        var xname = fso.GetExtensionName(fl.Path);
        if (xname in self.extensionTypeTable)
            fl.Delete();
        if (!!verbose)
            println("- Cleanup: " + fname);
    });
};
Excel.prototype.importComponent = function(path, xlBook) {
    var compos = xlBook.VBProject.VBComponents;
    compos.Import(path);
};
Excel.prototype.importDocument = function(path, xlBook) {
    var compos = xlBook.VBProject.VBComponents;
    var impCompo = compos.Import(path);
    
    var origCompo;
    var cname=impCompo.Name, bname=fso.GetBaseName(path);
    if (cname != bname) {
        origCompo = compos.item(bname);
    }
    else {
        var sht = xlBook.Worksheets.Add();
        compos  = xlBook.VBProject.VBComponents; // refreash Component collection
        origCompo = compos.item(sht.CodeName);
        
        var tmpname = "ImportTemp";
        var find = function(compos, name) {
            var ret = false;
            foreachEnum(compos, function(c) { return ret = (c.Name == name); });
            return ret;
        };
        while (find(compos, tmpname)) tmpname += "1";
        
        impCompo.Name  = tmpname;
        origCompo.Name = cname;
    }
    
    var imod=impCompo.CodeModule, omod=origCompo.CodeModule;
    omod.DeleteLines(1, omod.CountOfLines);
    omod.AddFromString(imod.Lines(1, imod.CountOfLines));
    compos.Remove(impCompo);
};
Excel.prototype.importSource = function(impdir, xlBook) {
    var self = this;
    foreachEnum(fso.GetFolder(impdir).Files, function(fl) {
        var xname = fso.GetExtensionName(fl.Path);
        var bname = fso.GetBaseName(fl.Path);
        if (xname == 'frx')  return false;
        if (!(xname in self.extensionTypeTable)) return false;
        
        if (xname != 'dcm')
            self.importComponent(fl.Path, xlBook);
        else
            self.importDocument(fl.Path, compos);
        
        println("- Import: " + fso.GetFileName(fl.Path));
        if (xname == 'frm') println("- Import: " + bname + ".frx");
    });
};
Excel.prototype.exportSource = function(xlBook, expdir) {
    var self = this;
    foreachEnum(xlBook.VBProject.VBComponents, function(compo) {
        if (self.isDirectiveOnly(compo.CodeModule)) return false;
        
        var xname = self.typeExtensionTable[compo.Type.toString()];
        var bname = compo.Name;
        var fname = bname + "." + xname;
        compo.Export(fso.BuildPath(expdir, fname));
        
        println("- Export: " + fname);
        if (xname == 'frm') println("- Export: " + bname + ".frx");
    });
};
Excel.prototype.combine = function(tsrc, tbin) {
    println("> Target: " + fso.GetFileName(tbin));
    
    var self = this;
    this.loanOfXlBook(tbin, true, function(xlBook) {
        self.cleanupBinary(xlBook);
        self.importSource(tsrc, xlBook);
        xlBook.Save();
    });
    
    println();
};
Excel.prototype.decombine = function(tbin, tsrc) {
    println("> Target: " + fso.GetFileName(tbin));
    
    var self = this;
    this.loanOfXlBook(tbin, false, function(xlBook) {
        self.cleanupSource(tsrc);
        self.exportSource(xlBook, tsrc);
    });
    
    println();
};
Excel.prototype.clear = function(tbin) {
    println("> Target: " + fso.GetFileName(tbin));
    
    var self = this;
    this.loanOfXlBook(tbin, false, function(xlBook) {
        self.cleanupBinary(xlBook, true);
        xlBook.Save();
    });
    
    println();
};

var Access = function() {};
Access.prototype = new Office();
Access.prototype.createOpenFile = function(acApp, path) {
    var dbFormat;
    var vernum = parseInt(acApp.SysCmd(acSysCmdAccessVer));
    switch (fso.GetExtensionName(path)) {
    case 'mdb':   dbFormat = acNewDatabaseFormatAccess2000;
                  break;
    case 'accdb': dbFormat = acNewDatabaseFormatAccess2007;
                  break;
    default:      dbFormat = (vernum < 12) ? acNewDatabaseFormatAccess2002 : acNewDatabaseFormatAccess2007;
                  path    += (vernum < 12) ? '.mdb'                        : '.accdb';
                  break;
    }
    
    if (!fso.FileExists(path))
        acApp.NewCurrentDatabase(path, dbFormat);
    else
        acApp.OpenCurrentDatabase(path);
    
    return path;
};
Access.prototype.loanOfAcProj = function(path, isCreate, callback) {
    var acApp, acProj, ret;
    
    try {
        acApp = new ActiveXObject("Access.Application");
        acApp.Visible = false;
    try {
        if (isCreate)
            this.createOpenFile(acApp, path);
        else
            acApp.OpenCurrentDatabase(path);
        
        ret = callback(acApp.CurrentProject);
    } finally { if (acApp.CurrentDB() != null) acApp.CurrentDB().Close(); }
    } finally { if (acApp != null)             acApp.Quit(); }
    
    return ret;
};
Access.prototype.extensionTypeTable = {
    'mdl': acModule, 'bas': acModule, 'cls': acModule,
    'frm': acForm,   'rpt': acReport, 'mcr': acMacro
};
Access.prototype.typeExtensionTable = {};
Access.prototype.typeExtensionTable[acModule] = 'mdl';
Access.prototype.typeExtensionTable[acForm]   = 'frm';
Access.prototype.typeExtensionTable[acReport] = 'rpt';
Access.prototype.typeExtensionTable[acMacro]  = 'mcr';
Access.prototype.iterAllObjects = function(acProj, action) {
    var i;
    var objs = new Array();
    for (i = 0; i < acProj.AllModules.Count; i++) objs.push(acProj.AllModules.item(i));
    for (i = 0; i < acProj.AllForms.Count;   i++) objs.push(acProj.AllForms.item(i));
    for (i = 0; i < acProj.AllReports.Count; i++) objs.push(acProj.AllReports.item(i));
    for (i = 0; i < acProj.AllMacros.Count;  i++) objs.push(acProj.AllMacros.item(i));
    
    for (i = 0; i < objs.length; i++) action(objs[i], i);
};
Access.prototype.cleanupBinary = function(acProj, verbose) {
    var acApp = acProj.Application;
    this.iterAllObjects(acProj, function(obj) {
        var name = obj.Name;
        acApp.DoCmd.DeleteObject(obj.Type, name);
        if (!!verbose)
            println("- Cleanup: " + name);
    });
};
Access.prototype.cleanupSource = function(dir, verbose) {
    if (!fso.FolderExists(dir)) {
         fso.CreateFolder(dir);
         return;
    }
    
    var self = this;
    foreachEnum(fso.GetFolder(dir).Files, function(fl) {
        var fname = fso.GetFileName(fl.Path);
        var xname = fso.GetExtensionName(fl.Path);
        if (xname in self.extensionTypeTable)
            fl.Delete();
        if (!!verbose)
            println("- Cleanup: " + fname);
    });
};
Access.prototype.importSource = function(impdir, acProj) {
    var acApp = acProj.Application;
    var self  = this;
    foreachEnum(fso.GetFolder(impdir).Files, function(fl) {
        var path  = fl.Path;
        var fname = fso.GetFileName(path);
        var xname = fso.GetExtensionName(path);
        var bname = fso.GetBaseName(path);
        
        if (xname in self.extensionTypeTable) {
            acApp.LoadFromText(self.extensionTypeTable[xname], bname, path);
            println("- Import: " + fname);
        }
    });
};
Access.prototype.exportSource = function(acProj, expdir) {
    var acApp  = acProj.Application;
    var compos = acApp.VBE.ActiveVBProject.VBComponents;
    var self   = this;
    this.iterAllObjects(acProj, function(obj) {
        var xname = self.typeExtensionTable[obj.Type.toString()];
        if (obj.Type == acModule) {
            switch (compos.item(obj.Name).Type) {
            case vbext_ct_StdModule:   xname = 'bas'; break;
            case vbext_ct_ClassModule: xname = 'cls'; break;
            default: break;
            }
        }
        
        var fname = obj.Name + "." + xname;
        acApp.SaveAsText(obj.Type, obj.Name, fso.BuildPath(expdir, fname));
        println("- Export: " + fname);
    });
};
Access.prototype.combine = function(tsrc, tbin) {
    println("> Target: " + fso.GetFileName(tbin));
    
    var self = this;
    this.loanOfAcProj(tbin, true, function(acProj) {
        self.cleanupBinary(acProj);
        self.importSource(tsrc, acProj);
    });
    
    println();
};
Access.prototype.decombine = function(tbin, tsrc) {
    println("> Target: " + fso.GetFileName(tbin));
    
    var self = this;
    this.loanOfAcProj(tbin, true, function(acProj) {
        self.cleanupSource(tsrc);
        self.exportSource(acProj, tsrc);
    });
    
    println();
};
Access.prototype.clear = function(tbin) {
    println("> Target: " + fso.GetFileName(tbin));
    
    var self = this;
    this.loanOfAcProj(tbin, true, function(acProj) {
        self.cleanupBinary(acProj, true);
    });
    
    println();
};

var Command = function(helper) {
    this.helper = helper;
};
Command.prototype.helper = null;
Command.prototype.combine = function() {
    this.helper.combineImpl(
        "combine", conf.src, conf.bin,
        function() { return conf.getSrcs(); });
};
Command.prototype.decombine = function() {
    this.helper.combineImpl(
        "decombine", conf.bin, conf.src,
        function() { return conf.getBins(); });
};
Command.prototype.clear = function clear() {
    var prop = "clear", getPaths = function() { return conf.getBins(); };
    var self = this;
    this.helper.iterTarget(getPaths, function(path) {
        self.helper.createOffice(path)[prop](path);
    });
};

var CommandHelper = function() {};
CommandHelper.prototype.createOffice = function(fname) {
    switch (fso.GetExtensionName(fname)) {
    case 'xls': case 'xlsm':  return new Excel();
    case 'mdb': case 'accdb': return new Access();
    default: return new Office();
    }
};
CommandHelper.prototype.isTempFile = function(fname) {
    return fname.substring(0, 2) == '~$';
};
CommandHelper.prototype.iterTarget = function(getPaths, action) {
    var self = this;
    foreachEnum(getPaths(), function(fl) {
        if (self.isTempFile(fl.Name)) return false;
        action(fl.Path);
    });
};
CommandHelper.prototype.combineImpl = function(prop, fromDir, toDir, getPaths) {
    if (!fso.FolderExists(fromDir)) {
        println("directory '" + fromDir + "' not exists.");
        return;
    }
    
    if (!fso.FolderExists(toDir)) fso.CreateFolder(toDir);
    
    var self = this;
    this.iterTarget(getPaths, function(path) {
        self.createOffice(path)[prop](path, fso.BuildPath(toDir, fso.GetFileName(path)));
    });
};
CommandHelper.prototype.getCommand = function(prop) {
    var cmd = new Command(this);
    return (prop in cmd && cmd[prop] != this)
           ? function() { cmd[prop].apply(cmd, arguments); }
           : undefined;
};

function main(args) {
    var prop = args.shift();
    var cmd  = new CommandHelper().getCommand(prop);
    if (cmd == undefined) {
        println("command '" + prop + "' is undefined.");
        return;
    }
    
    println("begin " + prop + "\n");
    cmd();
    println("end");
}

main(args);

