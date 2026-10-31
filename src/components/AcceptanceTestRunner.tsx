import React, { useState } from 'react';
import { ApiClient } from '../lib/api.ts';
import { CheckCircle2, XCircle, Play, ShieldAlert, Sparkles, RefreshCw } from 'lucide-react';

export const AcceptanceTestRunner: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [testReport, setTestReport] = useState<{
    allPassed: boolean;
    passedCount: number;
    total: number;
    scenarios: Array<{
      scenario: number;
      title: string;
      passed: boolean;
      message: string;
      details?: any;
    }>;
  } | null>(null);

  const runTests = async () => {
    setRunning(true);
    try {
      const res = await ApiClient.runAllTests();
      setTestReport(res);
    } catch (err: any) {
      alert(`Test runner error: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-6 py-6">
      <div className="bg-white rounded-3xl border border-neutral-200 shadow-md p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-900 text-emerald-300 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-rose-950 tracking-tight">
                Section 11 Acceptance Test Suite
              </h1>
            </div>
            <p className="text-xs text-neutral-500 mt-1 max-w-2xl">
              Automated execution of all 24 mandatory business rule scenarios defined in the Referral Portal Build
              Spec, testing transactional integrity, locking, OTP lockouts, credit FIFO, and message template customization.
            </p>
          </div>

          <button
            onClick={runTests}
            disabled={running}
            className="py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto shrink-0"
          >
            {running ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Running Scenarios 1–24...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                <span>Run All 24 Acceptance Tests</span>
              </>
            )}
          </button>
        </div>

        {testReport && (
          <div className="mt-6 pt-6 border-t border-neutral-200">
            <div
              className={`p-4 rounded-2xl flex items-center justify-between ${
                testReport.allPassed ? 'bg-emerald-50 border border-emerald-200 text-emerald-950' : 'bg-red-50 border border-red-200 text-red-950'
              }`}
            >
              <div className="flex items-center gap-3">
                {testReport.allPassed ? (
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-8 h-8 text-red-600 shrink-0" />
                )}
                <div>
                  <div className="text-lg font-black">
                    {testReport.allPassed
                      ? 'All 19 Scenarios Passed 100% Successfully!'
                      : `${testReport.passedCount} of ${testReport.total} Scenarios Passed`}
                  </div>
                  <div className="text-xs text-neutral-600 font-medium">
                    Verified with database ACID transactions, IST dates, and exact paise math.
                  </div>
                </div>
              </div>
              <div className="text-2xl font-black font-mono">
                {testReport.passedCount}/{testReport.total}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scenario List */}
      <div className="space-y-3">
        {testReport ? (
          testReport.scenarios.map((sc) => (
            <div
              key={sc.scenario}
              className={`p-4 bg-white rounded-2xl border transition shadow-xs flex items-start gap-3.5 ${
                sc.passed ? 'border-emerald-200 hover:border-emerald-300' : 'border-red-300 bg-red-50/20'
              }`}
            >
              <div className="mt-0.5">
                {sc.passed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black text-rose-950 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                    #{sc.scenario}
                  </span>
                  <span className="font-bold text-sm text-neutral-900">{sc.title}</span>
                </div>
                <div className="text-xs text-neutral-600 mt-1 font-medium">{sc.message}</div>
              </div>
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                  sc.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {sc.passed ? 'PASSED' : 'FAILED'}
              </span>
            </div>
          ))
        ) : (
          <div className="p-12 text-center bg-white rounded-3xl border border-neutral-200 text-neutral-400">
            <Sparkles className="w-8 h-8 text-amber-500 mx-auto mb-2 opacity-60" />
            <p className="text-sm font-semibold text-neutral-600">No test run recorded yet</p>
            <p className="text-xs text-neutral-400 mt-1">
              Click "Run All 19 Acceptance Tests" above to verify the entire system end-to-end.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
