/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  Settings,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Wand2,
  History,
  Plus,
  Key,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import ReactMarkdown from "react-markdown";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line, ResponsiveContainer } from 'recharts';
import { get, set, clear, del } from 'idb-keyval';

type FileData = {
  id: string;
  name: string;
  headers: string[];
  rows: any[];
};

type FileLibraryRecord = {
  id: string;
  timestamp: number;
  fileCount: number;
  sheetCount: number;
  files: FileData[];
};

type SecondaryFileConfig = {
  fileId: string;
  keyColumn: string;
  columnsToExtract: string[];
};

export default function App() {
  const [files, setFiles] = useState<FileData[]>([]);
  const [step, setStep] = useState<number>(0);

  // Configuration State
  const [mode, setMode] = useState<'merge' | 'clean' | null>(null);
  const [primaryFileId, setPrimaryFileId] = useState<string>("");
  const [primaryKeyColumn, setPrimaryKeyColumn] = useState<string>("");
  const [secondaryConfigs, setSecondaryConfigs] = useState<
    SecondaryFileConfig[]
  >([]);

  // Merged Data State
  const [mergedData, setMergedData] = useState<any[]>([]);
  const [mergedHeaders, setMergedHeaders] = useState<string[]>([]);
  const [joinType, setJoinType] = useState<'left' | 'inner' | 'full'>('left');
  const [chartConfig, setChartConfig] = useState<{type: 'bar' | 'pie' | 'line', xAxis: string, yAxis: string, data: any[]} | null>(null);

  // Data Cleaning State
  const [cleanColumn, setCleanColumn] = useState<string>("");
  const [cleanAction, setCleanAction] = useState<string>("trim");
  const [cleanFillValue, setCleanFillValue] = useState<string>("");
  const [cleanSuccessMsg, setCleanSuccessMsg] = useState<string>("");

  // Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "model"; text: string }[]>([
    { role: "model", text: "你好！我是您的資料分析助理。您可以隨時詢問我關於目前上傳或合併資料的問題。" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // BYOK State
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash");
  const [isConfigured, setIsConfigured] = useState(true); // 預設改為 true，跳過詢問畫面

  // Local DB Loading State
  const [isDbLoading, setIsDbLoading] = useState(true);

  // File Library State
  const [fileLibrary, setFileLibrary] = useState<FileLibraryRecord[]>([]);
  const [viewingRecord, setViewingRecord] = useState<FileLibraryRecord | null>(null);

  // Clear Confirm State
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Load state from IndexedDB and Backend on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const byok = await get('excel_tool_byok');
        if (byok) {
          setApiKey(byok.apiKey || "");
          setSelectedModel(byok.selectedModel || "gemini-1.5-flash"); // Default to 1.5 flash
          setIsConfigured(byok.isConfigured || false);
        }

        // Try to load from backend
        try {
          const resp = await fetch("http://localhost:8000/records/");
          if (resp.ok) {
            const backendRecords = await resp.json();
            if (backendRecords.length > 0) {
              setFileLibrary(backendRecords.map((r: any) => ({
                id: 'be-' + r.id,
                timestamp: new Date(r.timestamp).getTime(),
                fileCount: 1,
                sheetCount: 1,
                files: [{ id: 'f-' + r.id, name: r.filename, headers: r.headers, rows: r.rows }]
              })));
            }
          }
        } catch (beErr) {
          console.log("Backend not reachable, using local storage only");
          const library = await get('excel_tool_file_library');
          if (library && library.length > 0) {
            setFileLibrary(library);
          }
        }

        const appState = await get('excel_tool_app_state');
        if (appState) {
          setStep(appState.step || 0);
          setMode(appState.mode || null);
          setFiles(appState.files || []);
          setPrimaryFileId(appState.primaryFileId || "");
          setPrimaryKeyColumn(appState.primaryKeyColumn || "");
          setSecondaryConfigs(appState.secondaryConfigs || []);
          setMergedData(appState.mergedData || []);
          setMergedHeaders(appState.mergedHeaders || []);
          setJoinType(appState.joinType || 'left');
          setChartConfig(appState.chartConfig || null);
          if (appState.messages) setMessages(appState.messages);
        }
      } catch (e) {
        console.error("Failed to load from DB", e);
      } finally {
        setIsDbLoading(false);
      }
    };
    loadData();
  }, []);

  // Save BYOK state to IndexedDB
  useEffect(() => {
    if (!isDbLoading) {
      set('excel_tool_byok', { apiKey, selectedModel, isConfigured });
    }
  }, [apiKey, selectedModel, isConfigured, isDbLoading]);

  // Save App state to IndexedDB
  useEffect(() => {
    if (!isDbLoading) {
      set('excel_tool_app_state', {
        step, mode, files, primaryFileId, primaryKeyColumn, secondaryConfigs, mergedData, mergedHeaders, joinType, chartConfig, messages
      });
    }
  }, [step, mode, files, primaryFileId, primaryKeyColumn, secondaryConfigs, mergedData, mergedHeaders, joinType, chartConfig, messages, isDbLoading]);

  // Save File Library to IndexedDB
  useEffect(() => {
    if (!isDbLoading) {
      set('excel_tool_file_library', fileLibrary);
    }
  }, [fileLibrary, isDbLoading]);

  useEffect(() => {
    setCleanSuccessMsg("");
  }, [cleanColumn, cleanAction, cleanFillValue]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCleanData = () => {
    if (!cleanColumn) return;
    
    let modifiedCount = 0;
    const newData = mergedData.map(row => {
      const newRow = { ...row };
      const val = newRow[cleanColumn];
      
      if (cleanAction === 'fill_empty') {
        if (val === undefined || val === null || String(val).trim() === '') {
          newRow[cleanColumn] = cleanFillValue;
          modifiedCount++;
        }
      } else if (typeof val === 'string') {
        let strVal = String(val);
        if (cleanAction === 'trim' && strVal !== strVal.trim()) {
          newRow[cleanColumn] = strVal.trim();
          modifiedCount++;
        } else if (cleanAction === 'uppercase' && strVal !== strVal.toUpperCase()) {
          newRow[cleanColumn] = strVal.toUpperCase();
          modifiedCount++;
        } else if (cleanAction === 'lowercase' && strVal !== strVal.toLowerCase()) {
          newRow[cleanColumn] = strVal.toLowerCase();
          modifiedCount++;
        }
      }
      return newRow;
    });
    
    setMergedData(newData);
    setCleanSuccessMsg(`✅ 成功清理資料！共修改了 ${modifiedCount} 筆紀錄。`);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isTyping) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setIsTyping(true);

    try {
      let dataContext = "";
      if (mergedData.length > 0) {
        dataContext = `目前已合併的資料預覽 (前 5 筆):\n欄位: ${mergedHeaders.join(", ")}\n${JSON.stringify(mergedData.slice(0, 5))}`;
      } else if (files.length > 0) {
        dataContext = `目前已上傳的檔案資料預覽:\n${files
          .map(
            (f) =>
              `檔案: ${f.name}, 欄位: ${f.headers.join(", ")}, 前 3 筆資料: ${JSON.stringify(
                f.rows.slice(0, 3)
              )}`
          )
          .join("\n")}`;
      } else {
        dataContext = "目前尚未上傳任何資料。";
      }

      const response = await fetch("http://localhost:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          history: messages.slice(-10),
          data_context: dataContext,
          model: selectedModel
        })
      });

      if (!response.ok) throw new Error("Backend chat failed");
      const result = await response.json();

      setMessages((prev) => [...prev, { role: "model", text: result.text }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "model", text: "抱歉，後端助理暫時無法回應，請確認 Python 服務已啟動。" },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    const filePromises = Array.from(uploadedFiles).map((file: File) => {
      return new Promise<FileData[]>((resolve) => {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: "binary", cellDates: true });
          
          const newFiles: FileData[] = [];

          wb.SheetNames.forEach((wsname) => {
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (data.length > 0) {
              const headers = data[0] as string[];
              // Filter out empty headers
              const validHeaders = headers.filter(
                (h) => h !== undefined && h !== null && String(h).trim() !== "",
              );

              const rows = XLSX.utils.sheet_to_json(ws);

              newFiles.push({
                id: Math.random().toString(36).substring(7),
                name: wb.SheetNames.length > 1 ? `${file.name} - ${wsname}` : file.name,
                headers: validHeaders,
                rows: rows,
              });
            }
          });
          resolve(newFiles);
        };
        reader.readAsBinaryString(file);
      });
    });

    const results = await Promise.all(filePromises);
    const allNewFiles = results.flat();

    if (allNewFiles.length > 0) {
      setFiles((prev) => [...prev, ...allNewFiles]);
      
      const newRecord: FileLibraryRecord = {
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        fileCount: uploadedFiles.length,
        sheetCount: allNewFiles.length,
        files: allNewFiles
      };
      
      setFileLibrary((prev) => [newRecord, ...prev]);
    }

    // Reset file input
    e.target.value = "";
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    if (primaryFileId === id) {
      setPrimaryFileId("");
      setPrimaryKeyColumn("");
    }
    setSecondaryConfigs((prev) => prev.filter((c) => c.fileId !== id));
  };

  const removeRecordFromLibrary = (id: string) => {
    setFileLibrary((prev) => prev.filter((r) => r.id !== id));
    if (viewingRecord?.id === id) setViewingRecord(null);
  };

  const addRecordToActiveFiles = (record: FileLibraryRecord) => {
    setFiles(prev => {
      const newFiles = [...prev];
      record.files.forEach(f => {
        if (!newFiles.some(existing => existing.id === f.id)) {
          newFiles.push(f);
        }
      });
      return newFiles;
    });
    setViewingRecord(null);
  };

  const handlePrimaryFileSelect = (fileId: string) => {
    setPrimaryFileId(fileId);
    setPrimaryKeyColumn("");

    // Initialize secondary configs for all other files
    const otherFiles = files.filter((f) => f.id !== fileId);
    setSecondaryConfigs(
      otherFiles.map((f) => ({
        fileId: f.id,
        keyColumn: "",
        columnsToExtract: [],
      })),
    );
  };

  const updateSecondaryConfig = (
    fileId: string,
    field: keyof SecondaryFileConfig,
    value: any,
  ) => {
    setSecondaryConfigs((prev) =>
      prev.map((config) => {
        if (config.fileId === fileId) {
          return { ...config, [field]: value };
        }
        return config;
      }),
    );
  };

  const toggleColumnToExtract = (fileId: string, column: string) => {
    setSecondaryConfigs((prev) =>
      prev.map((config) => {
        if (config.fileId === fileId) {
          const currentCols = config.columnsToExtract;
          const newCols = currentCols.includes(column)
            ? currentCols.filter((c) => c !== column)
            : [...currentCols, column];
          return { ...config, columnsToExtract: newCols };
        }
        return config;
      }),
    );
  };

  const performMerge = () => {
    const primaryFile = files.find((f) => f.id === primaryFileId);
    if (!primaryFile || !primaryKeyColumn) return;

    let newMergedData = [...primaryFile.rows];
    let newMergedHeaders = [...primaryFile.headers];

    secondaryConfigs.forEach((config) => {
      if (!config.keyColumn || config.columnsToExtract.length === 0) return;

      const secondaryFile = files.find((f) => f.id === config.fileId);
      if (!secondaryFile) return;

      // Create a lookup map for the secondary file
      const lookupMap = new Map();
      secondaryFile.rows.forEach((row) => {
        const key = row[config.keyColumn];
        if (key !== undefined && key !== null) {
          lookupMap.set(String(key).trim().toLowerCase(), row);
        }
      });

      // Add new headers with prefix to avoid collision
      const prefix = secondaryFile.name.split(".")[0] + "_";
      config.columnsToExtract.forEach((col) => {
        const newHeaderName = `${prefix}${col}`;
        if (!newMergedHeaders.includes(newHeaderName)) {
          newMergedHeaders.push(newHeaderName);
        }
      });

      if (joinType === 'inner') {
        newMergedData = newMergedData.filter(row => {
          const primaryKey = row[primaryKeyColumn];
          if (primaryKey === undefined || primaryKey === null) return false;
          return lookupMap.has(String(primaryKey).trim().toLowerCase());
        });
      }

      const matchedSecondaryKeys = new Set();

      // Merge data
      newMergedData = newMergedData.map((row) => {
        const primaryKey = row[primaryKeyColumn];
        const newRow = { ...row };

        if (primaryKey !== undefined && primaryKey !== null) {
          const lookupKey = String(primaryKey).trim().toLowerCase();
          const matchedRow = lookupMap.get(lookupKey);

          if (matchedRow) {
            matchedSecondaryKeys.add(lookupKey);
            config.columnsToExtract.forEach((col) => {
              newRow[`${prefix}${col}`] = matchedRow[col];
            });
          }
        }
        return newRow;
      });

      if (joinType === 'full') {
        secondaryFile.rows.forEach(row => {
          const key = row[config.keyColumn];
          if (key !== undefined && key !== null) {
            const lookupKey = String(key).trim().toLowerCase();
            if (!matchedSecondaryKeys.has(lookupKey)) {
              const newRow: any = {};
              newRow[primaryKeyColumn] = key;
              config.columnsToExtract.forEach((col) => {
                newRow[`${prefix}${col}`] = row[col];
              });
              newMergedData.push(newRow);
            }
          }
        });
      }
    });

    setMergedData(newMergedData);
    setMergedHeaders(newMergedHeaders);
    setStep(4);

    // Sync to Backend
    try {
      fetch("http://localhost:8000/records/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `合併資料_${new Date().toISOString().slice(0, 10)}.xlsx`,
          headers: newMergedHeaders,
          rows: newMergedData,
          description: "自動保存的合併紀錄"
        })
      });
    } catch (e) {
      console.error("Failed to sync to backend", e);
    }
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(mergedData, { header: mergedHeaders });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "合併資料");

    // 如果有生成圖表，將圖表的彙整數據匯出為第二個 Sheet
    if (chartConfig && chartConfig.data && chartConfig.data.length > 0) {
      const chartExportData = chartConfig.data.map(item => ({
        [chartConfig.xAxis]: item.name,
        [chartConfig.yAxis]: item.value
      }));
      const wsChart = XLSX.utils.json_to_sheet(chartExportData);
      XLSX.utils.book_append_sheet(wb, wsChart, "圖表數據");
    }

    XLSX.writeFile(wb, "合併資料.xlsx");
  };

  const handleClearAllData = async () => {
    try {
      await clear();
      // 確保清除所有我們使用的 key
      await del('excel_tool_app_state');
      await del('excel_tool_file_library');
      await del('excel_tool_byok');
      
      // 手動重置所有狀態 (因為 iframe 環境下 window.location.reload 可能會被阻擋)
      setApiKey("");
      setSelectedModel("gemini-3-flash-preview");
      setIsConfigured(false);
      setStep(0);
      setMode(null);
      setFiles([]);
      setPrimaryFileId("");
      setPrimaryKeyColumn("");
      setSecondaryConfigs([]);
      setMergedData([]);
      setMergedHeaders([]);
      setJoinType('left');
      setChartConfig(null);
      setMessages([{ role: "model", text: "你好！我是您的資料分析助理。您可以隨時詢問我關於目前上傳或合併資料的問題。" }]);
      setFileLibrary([]);
      setViewingRecord(null);
      setCleanColumn("");
      setCleanAction("trim");
      setCleanFillValue("");
      setCleanSuccessMsg("");
      setShowClearConfirm(false);
    } catch (e) {
      console.error("Failed to clear IndexedDB", e);
      // alert might also be blocked, but let's just log it
    }
  };

  const isStep2Valid = mode === 'clean' ? primaryFileId !== "" : primaryFileId !== "" && primaryKeyColumn !== "";
  const isStep3Valid =
    secondaryConfigs.length > 0 &&
    secondaryConfigs.every(
      (c) => c.keyColumn !== "" && c.columnsToExtract.length > 0,
    );

  const getSteps = () => {
    if (mode === 'clean') {
      return [
        { num: 1, label: "上傳檔案", displayNum: 1 },
        { num: 2, label: "選擇資料表", displayNum: 2 },
        { num: 4, label: "清理與分析", displayNum: 3 },
      ];
    }
    return [
      { num: 1, label: "上傳檔案", displayNum: 1 },
      { num: 2, label: "設定主檔案", displayNum: 2 },
      { num: 3, label: "合併設定", displayNum: 3 },
      { num: 4, label: "匯出資料", displayNum: 4 },
    ];
  };

  if (isDbLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-slate-500 font-medium">正在載入本地資料...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setStep(0); setMode(null); }}>
            <div className="bg-indigo-600 p-2 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">
              Excel 資料工具
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-500 font-medium hidden sm:block">
              資料合併與清理
            </div>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-md transition-colors"
            >
              清除所有資料
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Stepper */}
        {step > 0 && (
          <div className="flex items-center justify-between mb-12 relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-slate-200 -z-10"></div>
            {getSteps().map((s) => (
              <div
                key={s.num}
                className="flex flex-col items-center gap-2 bg-slate-50 px-2"
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-colors ${
                    step >= s.num
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                      : "bg-white border-2 border-slate-200 text-slate-400"
                  }`}
                >
                  {step > s.num ? <CheckCircle2 className="w-5 h-5" /> : s.displayNum}
                </div>
                <span
                  className={`text-xs font-medium ${step >= s.num ? "text-slate-900" : "text-slate-400"}`}
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className={step > 0 ? "bg-white rounded-2xl shadow-sm border border-slate-200 p-8" : ""}>
          <AnimatePresence mode="wait">
            {/* STEP 0: HOME / MODE SELECTION */}
            {step === 0 && (
              <motion.div
                key="step0"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8 py-12"
              >
                <div className="text-center space-y-4 mb-12">
                  <h2 className="text-4xl font-bold tracking-tight text-slate-900">
                    歡迎使用 Excel 資料工具
                  </h2>
                  <p className="text-slate-500 text-lg max-w-2xl mx-auto">
                    請選擇您想要執行的操作，或點擊右下角請 AI 助理幫您產生測試資料來體驗功能。
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                  <button
                    onClick={() => { setMode('merge'); setStep(1); }}
                    className="flex flex-col items-center text-center p-10 rounded-3xl border-2 border-slate-200 hover:border-indigo-600 hover:bg-indigo-50 transition-all group shadow-sm hover:shadow-md bg-white"
                  >
                    <div className="bg-indigo-100 p-5 rounded-2xl mb-6 group-hover:scale-110 transition-transform">
                      <FileSpreadsheet className="w-10 h-10 text-indigo-600" />
                    </div>
                    <h3 className="text-2xl font-semibold mb-3 text-slate-900">合併資料 (VLOOKUP)</h3>
                    <p className="text-slate-500">上傳多份 Excel 檔案，透過共同鍵值將它們合併成一份完整的資料表。</p>
                  </button>

                  <button
                    onClick={() => { setMode('clean'); setStep(1); }}
                    className="flex flex-col items-center text-center p-10 rounded-3xl border-2 border-slate-200 hover:border-emerald-600 hover:bg-emerald-50 transition-all group shadow-sm hover:shadow-md bg-white"
                  >
                    <div className="bg-emerald-100 p-5 rounded-2xl mb-6 group-hover:scale-110 transition-transform">
                      <Wand2 className="w-10 h-10 text-emerald-600" />
                    </div>
                    <h3 className="text-2xl font-semibold mb-3 text-slate-900">清理與分析資料</h3>
                    <p className="text-slate-500">上傳單一 Excel 檔案，進行資料格式清理、填補空白、排序與 AI 智慧分析。</p>
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 1: UPLOAD */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2 mb-8">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    選擇資料來源
                  </h2>
                  <p className="text-slate-500">
                    {mode === 'clean' ? '請選擇 1 份您想要清理或分析的資料。' : '請選擇 2 份或以上您想要合併的資料。'}您可以上傳新檔案，或從歷史檔案庫中選擇。
                  </p>
                </div>

                <div className="grid lg:grid-cols-2 gap-8">
                  {/* Upload New File Section */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800">
                      <Upload className="w-5 h-5 text-indigo-600" /> 上傳新檔案
                    </h3>
                    <div className="relative group cursor-pointer">
                      <input
                        type="file"
                        multiple={mode === 'merge'}
                        accept=".xlsx, .xls, .csv"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center group-hover:border-indigo-500 group-hover:bg-indigo-50 transition-all">
                        <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm group-hover:scale-110 transition-transform">
                          <Upload className="w-8 h-8 text-indigo-500" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">
                            點擊或拖曳檔案至此
                          </p>
                          <p className="text-sm text-slate-500 mt-1">
                            支援 .xlsx, .xls, .csv 格式
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* File Library Section */}
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg flex items-center gap-2 text-slate-800">
                      <History className="w-5 h-5 text-emerald-600" /> 歷史檔案庫
                    </h3>
                    <div className="border border-slate-200 rounded-2xl bg-slate-50 h-[240px] overflow-y-auto p-4 flex flex-col">
                      {fileLibrary.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 m-auto">
                          <FileSpreadsheet className="w-10 h-10 mb-2 opacity-50" />
                          <p className="text-sm">尚無歷史檔案紀錄</p>
                        </div>
                      ) : viewingRecord ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between mb-2 sticky top-0 bg-slate-50 pb-2">
                            <button onClick={() => setViewingRecord(null)} className="text-sm text-indigo-600 hover:text-indigo-700 flex items-center gap-1 font-medium">
                              ← 返回列表
                            </button>
                            <button onClick={() => addRecordToActiveFiles(viewingRecord)} className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 font-medium transition-colors">
                              載入此紀錄
                            </button>
                          </div>
                          <div className="space-y-2">
                            {viewingRecord.files.map(file => (
                              <div key={file.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-white">
                                <FileSpreadsheet className="w-4 h-4 text-slate-400 shrink-0" />
                                <div className="truncate flex-1">
                                  <p className="font-medium text-sm text-slate-700 truncate">{file.name}</p>
                                  <p className="text-xs text-slate-500">{file.rows.length} 列, {file.headers.length} 欄位</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {fileLibrary.map((record) => (
                            <div
                              key={record.id}
                              onClick={() => setViewingRecord(record)}
                              className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition-all cursor-pointer group"
                            >
                              <div className="flex items-center gap-3 overflow-hidden flex-1">
                                <History className="w-5 h-5 text-slate-400 shrink-0 group-hover:text-indigo-500 transition-colors" />
                                <div className="truncate">
                                  <p className="font-medium text-sm text-slate-700 truncate group-hover:text-indigo-700 transition-colors">
                                    {new Date(record.timestamp).toLocaleString()}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {record.fileCount} 個檔案, {record.sheetCount} 個資料表
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 ml-2">
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeRecordFromLibrary(record.id); }}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="刪除此紀錄"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="space-y-3 mt-8 pt-8 border-t border-slate-100">
                    <h3 className="font-medium text-sm text-slate-500 uppercase tracking-wider">
                      本次選定的檔案 ({files.length})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-indigo-200 bg-indigo-50/50"
                        >
                          <div className="flex items-center gap-3 overflow-hidden">
                            <FileSpreadsheet className="w-5 h-5 text-indigo-600 shrink-0" />
                            <div className="truncate">
                              <p className="font-medium text-sm text-indigo-900 truncate">
                                {file.name}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => removeFile(file.id)}
                            className="p-1.5 text-indigo-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-6 border-t border-slate-100 mt-8">
                  <button
                    onClick={() => {
                      if (mode === 'clean' && files.length === 1) {
                        const file = files[0];
                        setMergedData(file.rows);
                        setMergedHeaders(file.headers);
                        setStep(4);
                      } else {
                        setStep(2);
                      }
                    }}
                    disabled={mode === 'clean' ? files.length < 1 : files.length < 2}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    下一步
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: PRIMARY FILE / SELECT SHEET */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2 mb-8">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    {mode === 'clean' ? '選擇資料表' : '設定主檔案'}
                  </h2>
                  <p className="text-slate-500">
                    {mode === 'clean' ? '檔案中包含多個資料表，請選擇您想要進行清理與分析的目標。' : '選擇作為基準的主檔案，以及用來比對資料的鍵值欄位。'}
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="block font-medium text-slate-900">
                      {mode === 'clean' ? '請選擇資料表：' : '1. 哪一份是您的主檔案？'}
                    </label>
                    <div className="space-y-2">
                      {files.map((file) => (
                        <label
                          key={file.id}
                          className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                            primaryFileId === file.id
                              ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                              : "border-slate-200 hover:border-indigo-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name="primaryFile"
                            value={file.id}
                            checked={primaryFileId === file.id}
                            onChange={() => handlePrimaryFileSelect(file.id)}
                            className="w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-600"
                          />
                          <span className="font-medium text-sm">
                            {file.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {mode === 'merge' && primaryFileId && (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-4"
                    >
                      <label className="block font-medium text-slate-900">
                        2. 選擇比對鍵值欄位
                      </label>
                      <p className="text-sm text-slate-500 mb-2">
                        這是用來在其他檔案中尋找對應資料的唯一識別碼（例如：ID、Email）。
                      </p>
                      <select
                        value={primaryKeyColumn}
                        onChange={(e) => setPrimaryKeyColumn(e.target.value)}
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all"
                      >
                        <option value="" disabled>
                          請選擇一個欄位...
                        </option>
                        {files
                          .find((f) => f.id === primaryFileId)
                          ?.headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                      </select>
                    </motion.div>
                  )}
                </div>

                <div className="flex justify-between pt-6 border-t border-slate-100 mt-8">
                  <button
                    onClick={() => setStep(1)}
                    className="px-6 py-2.5 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    onClick={() => {
                      if (mode === 'clean') {
                        const file = files.find(f => f.id === primaryFileId);
                        if (file) {
                          setMergedData(file.rows);
                          setMergedHeaders(file.headers);
                          setStep(4);
                        }
                      } else {
                        setStep(3);
                      }
                    }}
                    disabled={!isStep2Valid}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    下一步
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: CONFIGURE MERGE */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="text-center space-y-2 mb-8">
                  <h2 className="text-2xl font-semibold tracking-tight">
                    設定資料合併規則
                  </h2>
                  <p className="text-slate-500">
                    針對每一份次要檔案，選擇對應的比對鍵值以及想要提取的欄位。
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 mb-6">
                  <h3 className="font-semibold text-lg">進階合併模式</h3>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="joinType" value="left" checked={joinType === 'left'} onChange={() => setJoinType('left')} className="text-indigo-600 focus:ring-indigo-600" />
                      <span className="text-sm font-medium">左側合併 (預設)</span>
                      <span className="text-xs text-slate-500">- 保留主檔案所有資料</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="joinType" value="inner" checked={joinType === 'inner'} onChange={() => setJoinType('inner')} className="text-indigo-600 focus:ring-indigo-600" />
                      <span className="text-sm font-medium">交集合併</span>
                      <span className="text-xs text-slate-500">- 僅保留雙方都有的資料</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="joinType" value="full" checked={joinType === 'full'} onChange={() => setJoinType('full')} className="text-indigo-600 focus:ring-indigo-600" />
                      <span className="text-sm font-medium">聯集合併</span>
                      <span className="text-xs text-slate-500">- 保留所有檔案的資料</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-6">
                  {secondaryConfigs.map((config, index) => {
                    const file = files.find((f) => f.id === config.fileId);
                    if (!file) return null;

                    const primaryFile = files.find((f) => f.id === primaryFileId);
                    const primaryHeaders = primaryFile?.headers || [];

                    return (
                      <div
                        key={config.fileId}
                        className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-6"
                      >
                        <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
                          <div className="bg-indigo-100 text-indigo-700 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                            {index + 1}
                          </div>
                          <h3 className="font-semibold text-lg">{file.name}</h3>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                          <div className="space-y-3">
                            <label className="block font-medium text-sm text-slate-900">
                              對應主檔案鍵值 (
                              <span className="text-indigo-600 font-bold">
                                {primaryKeyColumn}
                              </span>
                              )
                            </label>
                            <select
                              value={config.keyColumn}
                              onChange={(e) =>
                                updateSecondaryConfig(
                                  config.fileId,
                                  "keyColumn",
                                  e.target.value,
                                )
                              }
                              className="w-full p-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all"
                            >
                              <option value="" disabled>
                                請選擇對應欄位...
                              </option>
                              {file.headers.map((header) => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-3">
                            <label className="block font-medium text-sm text-slate-900">
                              要提取的欄位
                            </label>
                            <div className="bg-white border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                              {file.headers.filter((h) => h !== config.keyColumn && !primaryHeaders.includes(h)).length === 0 ? (
                                <p className="text-sm text-slate-500 italic p-2">
                                  沒有其他可提取的欄位（重複欄位已自動隱藏）。
                                </p>
                              ) : (
                                file.headers
                                  .filter((h) => h !== config.keyColumn && !primaryHeaders.includes(h))
                                  .map((header) => (
                                    <label
                                      key={header}
                                      className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded cursor-pointer"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={config.columnsToExtract.includes(
                                          header,
                                        )}
                                        onChange={() =>
                                          toggleColumnToExtract(
                                            config.fileId,
                                            header,
                                          )
                                        }
                                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-600"
                                      />
                                      <span className="text-sm">{header}</span>
                                    </label>
                                  ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between pt-6 border-t border-slate-100 mt-8">
                  <button
                    onClick={() => setStep(2)}
                    className="px-6 py-2.5 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    上一步
                  </button>
                  <button
                    onClick={performMerge}
                    disabled={!isStep3Valid}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    開始合併
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 4: PREVIEW & EXPORT */}
            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight text-emerald-600 flex items-center gap-2">
                      <CheckCircle2 className="w-6 h-6" /> {mode === 'clean' ? '資料載入成功' : '合併成功'}
                    </h2>
                    <p className="text-slate-500 mt-1">
                      共 {mode === 'clean' ? '載入' : '產生'} {mergedData.length} 列資料與{" "}
                      {mergedHeaders.length} 個欄位。
                    </p>
                  </div>
                  <button
                    onClick={exportToExcel}
                    className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200"
                  >
                    <Download className="w-5 h-5" />
                    下載 Excel
                  </button>
                </div>

                {/* Data Cleaning UI */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="bg-indigo-100 p-1.5 rounded-lg">
                      <Wand2 className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-800">資料清理工具</h3>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 space-y-2 w-full">
                      <label className="block text-sm font-medium text-slate-700">選擇欄位</label>
                      <select value={cleanColumn} onChange={e => setCleanColumn(e.target.value)} className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 outline-none bg-white">
                        <option value="">請選擇...</option>
                        {mergedHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 space-y-2 w-full">
                      <label className="block text-sm font-medium text-slate-700">清理動作</label>
                      <select value={cleanAction} onChange={e => setCleanAction(e.target.value)} className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 outline-none bg-white">
                        <option value="trim">去除前後空白</option>
                        <option value="uppercase">全部轉大寫</option>
                        <option value="lowercase">全部轉小寫</option>
                        <option value="fill_empty">填補空白值</option>
                      </select>
                    </div>
                    {cleanAction === 'fill_empty' && (
                      <div className="flex-1 space-y-2 w-full">
                        <label className="block text-sm font-medium text-slate-700">填補內容</label>
                        <input type="text" value={cleanFillValue} onChange={e => setCleanFillValue(e.target.value)} placeholder="例如：無" className="w-full p-2.5 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-600 outline-none" />
                      </div>
                    )}
                    <button onClick={handleCleanData} disabled={!cleanColumn} className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap w-full sm:w-auto">
                      執行清理
                    </button>
                  </div>
                  {cleanSuccessMsg && (
                    <div className="mt-4 p-3 bg-emerald-50 text-emerald-700 text-sm rounded-lg border border-emerald-100">
                      {cleanSuccessMsg}
                    </div>
                  )}
                </div>

                {chartConfig && (
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-8">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-semibold text-slate-800">資料視覺化：{chartConfig.xAxis} vs {chartConfig.yAxis}</h3>
                      <button onClick={() => setChartConfig(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        {chartConfig.type === 'bar' ? (
                          <BarChart data={chartConfig.data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        ) : chartConfig.type === 'line' ? (
                          <LineChart data={chartConfig.data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Line type="monotone" dataKey="value" stroke="#4f46e5" strokeWidth={2} />
                          </LineChart>
                        ) : (
                          <PieChart>
                            <Pie data={chartConfig.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                              {chartConfig.data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][index % 6]} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                          </PieChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-700 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                          {mergedHeaders.map((header, i) => (
                            <th
                              key={i}
                              className="px-6 py-3 font-semibold whitespace-nowrap"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {mergedData.slice(0, 50).map((row, rowIndex) => (
                          <tr
                            key={rowIndex}
                            className="hover:bg-slate-50 transition-colors"
                          >
                            {mergedHeaders.map((header, colIndex) => {
                              const val = row[header];
                              let displayVal: React.ReactNode = <span className="text-slate-300">-</span>;
                              if (val !== undefined && val !== null) {
                                if (val instanceof Date) {
                                  const y = val.getFullYear();
                                  const m = String(val.getMonth() + 1).padStart(2, "0");
                                  const d = String(val.getDate()).padStart(2, "0");
                                  displayVal = `${y}-${m}-${d}`;
                                } else {
                                  displayVal = String(val);
                                }
                              }
                              return (
                                <td
                                  key={colIndex}
                                  className="px-6 py-3 whitespace-nowrap text-slate-600"
                                >
                                  {displayVal}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {mergedData.length > 50 && (
                    <div className="bg-slate-50 p-3 text-center text-sm text-slate-500 border-t border-slate-200">
                      目前顯示前 50 列預覽資料。請下載 Excel 檔案以檢視完整資料。
                    </div>
                  )}
                </div>

                <div className="flex justify-start pt-6 border-t border-slate-100 mt-8">
                  <button
                    onClick={() => {
                      setStep(0);
                      setMode(null);
                      setFiles([]);
                      setPrimaryFileId("");
                      setPrimaryKeyColumn("");
                      setSecondaryConfigs([]);
                      setMergedData([]);
                      setMergedHeaders([]);
                      setChartConfig(null);
                    }}
                    className="px-6 py-2.5 rounded-lg font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    回首頁
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Chat FAB */}
      <button
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-all z-40 flex items-center justify-center hover:scale-105"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {/* Chat Panel */}
      <AnimatePresence>
        {isChatOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsChatOpen(false)}
              className="fixed inset-0 bg-slate-900 z-40 md:hidden"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 w-full md:w-[400px] h-full bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-indigo-50/50">
                <div className="flex items-center gap-2">
                  <div className="bg-indigo-600 p-1.5 rounded-lg">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="font-semibold text-slate-900">資料分析助理</h2>
                </div>
                <button
                  onClick={() => setIsChatOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 ${
                      msg.role === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        msg.role === "user"
                          ? "bg-indigo-100 text-indigo-600"
                          : "bg-emerald-100 text-emerald-600"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <User className="w-4 h-4" />
                      ) : (
                        <Bot className="w-4 h-4" />
                      )}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                        msg.role === "user"
                          ? "bg-indigo-600 text-white rounded-tr-none"
                          : "bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm"
                      }`}
                    >
                      {msg.role === "model" ? (
                        <div className="markdown-body prose prose-sm prose-slate max-w-none">
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                      ) : (
                        msg.text
                      )}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-3 flex-row">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                      <span className="text-sm text-slate-500">思考中...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 bg-white border-t border-slate-100">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="輸入問題，例如：幫我分析資料趨勢..."
                    className="flex-1 p-3 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isTyping}
                    className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Clear Confirmation Modal */}
      <AnimatePresence>
        {showClearConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-6"
            >
              <div className="flex items-center gap-3 text-red-600">
                <AlertCircle className="w-6 h-6" />
                <h3 className="text-xl font-bold text-slate-900">確定要清除所有資料？</h3>
              </div>
              <p className="text-slate-500">
                這將會永久刪除您上傳的檔案、合併結果、歷史檔案庫與對話紀錄，並且需要重新輸入 API Key。此操作無法復原。
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleClearAllData}
                  className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 rounded-lg font-medium transition-colors"
                >
                  確定清除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
