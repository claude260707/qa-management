import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Chart, registerables } from 'chart.js';
import { dailyReportApi, projectsApi } from './api';
import type { DailyReportResponse, DailyReportDetail } from './api';

Chart.register(...registerables);

const STATUS_LABEL: Record<string, string> = {
  not_run: '미진행',
  pass: 'Pass',
  fail: 'Fail',
  blocked: 'Blocked',
  n_a: 'N/A',
  n_t: 'N/T',
};

const STATUS_BG: Record<string, string> = {
  pass: '#e6f7ec',
  fail: '#fdecea',
  blocked: '#fdf1e0',
  n_a: '#f2f2f2',
  n_t: '#f2f2f2',
  not_run: '#f7f7f7',
};

const STATUS_COLOR: Record<string, string> = {
  pass: '#2a8f4d',
  fail: '#c0392b',
  blocked: '#c77700',
  n_a: '#888',
  n_t: '#888',
  not_run: '#999',
};

const ROUND_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];

interface Props {
  projectId: number;
}

export default function DailyReportScreen({ projectId }: Props) {
  const [report, setReport] = useState<DailyReportResponse | null>(null);
  const [detail, setDetail] = useState<DailyReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [tcStatusFilter, setTcStatusFilter] = useState<'all' | 'fail' | 'not_run' | 'blocked'>('all');
  const [tcSearchText, setTcSearchText] = useState('');
  const [showPassedTc, setShowPassedTc] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  async function loadReport() {
    setLoading(true);
    setError(null);
    try {
      const [reportData, detailData] = await Promise.all([
        dailyReportApi.get(projectId),
        dailyReportApi.getDetail(projectId),
      ]);
      setReport(reportData);
      setDetail(detailData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '리포트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!detail || !canvasRef.current || detail.rounds.length === 0) return;

    const statusKeys = ['pass', 'fail', 'blocked', 'n_a', 'n_t', 'not_run'];
    const labels = statusKeys.map((s) => STATUS_LABEL[s]);

    const datasets = detail.rounds.map((round, i) => ({
      label: `${round}차`,
      data: statusKeys.map((s) => detail.roundSummary[round]?.[s as keyof typeof detail.roundSummary[typeof round]] ?? 0),
      backgroundColor: ROUND_COLORS[i % ROUND_COLORS.length],
      borderRadius: 4,
    }));

    if (chartRef.current) {
      chartRef.current.destroy();
    }
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [detail]);

  async function handleAdvanceRound() {
    if (!confirm('다음 차수로 넘어갈까요? 이후 저장되는 결과는 새 차수로 기록됩니다.')) return;
    setAdvancing(true);
    try {
      await projectsApi.advanceRound(projectId);
      await loadReport();
    } catch (e) {
      setError(e instanceof Error ? e.message : '차수 진행에 실패했습니다.');
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) return <p>불러오는 중...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (!report || report.round === null) {
    return <p>{report?.message ?? '아직 실행 이력이 없습니다.'}</p>;
  }

  const { today, yesterday } = report;
  const todayPass = today?.by_status.pass ?? 0;
  const todayTotal = today?.total ?? 0;
  const passRate = todayTotal ? Math.round((todayPass / todayTotal) * 100) : 0;
  const yesterdayPass = yesterday?.by_status.pass ?? 0;
  const delta = todayPass - yesterdayPass;

  return (
    <div className="daily-report">
      <div className="daily-report-header">
        <div>
          <span className="daily-report-round">{report.round}차 진행 중</span>
          <span className="daily-report-date"> · {report.date}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a
            href={dailyReportApi.exportUrl(projectId, { round: report.round, date: report.date })}
            download
            className="btn-ghost"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            📥 엑셀 다운로드
          </a>
          <button onClick={handleAdvanceRound} disabled={advancing}>
            {advancing ? '진행 중...' : '다음 차수 시작'}
          </button>
        </div>
      </div>

      <div className="daily-report-kpis" style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 16px', border: '1px solid #eee', borderRadius: 8, flex: 1 }}>
          <span className="kpi-label" style={{ fontSize: 12, color: '#888' }}>전체 TC</span>
          <span className="kpi-value" style={{ fontSize: 20, fontWeight: 700 }}>{todayTotal}</span>
        </div>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 16px', border: '1px solid #eee', borderRadius: 8, flex: 1 }}>
          <span className="kpi-label" style={{ fontSize: 12, color: '#888' }}>통과율</span>
          <span className="kpi-value" style={{ fontSize: 20, fontWeight: 700 }}>{passRate}%</span>
        </div>
        <div className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 16px', border: '1px solid #eee', borderRadius: 8, flex: 1 }}>
          <span className="kpi-label" style={{ fontSize: 12, color: '#888' }}>어제 대비 통과</span>
          <span className="kpi-value" style={{ fontSize: 20, fontWeight: 700, color: delta >= 0 ? 'var(--tc-status-pass, green)' : 'var(--tc-status-fail, red)' }}>
            {delta >= 0 ? `+${delta}` : delta}
          </span>
        </div>
      </div>

      <div className="daily-report-columns" style={{ display: 'flex', gap: 24 }}>
        <div className="daily-report-column" style={{ flex: 1 }}>
          <h4>자동 (Playwright)</h4>
          {Object.entries(today?.by_executor.automated ?? {}).map(([status, count]) => (
            <div key={status} className="daily-report-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{STATUS_LABEL[status] ?? status}</span>
              <span>{count}</span>
            </div>
          ))}
          {Object.keys(today?.by_executor.automated ?? {}).length === 0 && <p className="daily-report-empty">자동 실행 기록 없음</p>}
        </div>
        <div className="daily-report-column" style={{ flex: 1 }}>
          <h4>수동</h4>
          {Object.entries(today?.by_executor.manual ?? {}).map(([status, count]) => (
            <div key={status} className="daily-report-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
              <span>{STATUS_LABEL[status] ?? status}</span>
              <span>{count}</span>
            </div>
          ))}
          {Object.keys(today?.by_executor.manual ?? {}).length === 0 && <p className="daily-report-empty">수동 실행 기록 없음</p>}
        </div>
      </div>

      {detail && detail.rounds.length > 0 && (
        <>
          <div className="daily-report-chart-legend" style={{ display: 'flex', gap: 16, marginTop: 16 }}>
            {detail.rounds.map((round, i) => (
              <span key={round} className="daily-report-legend-item" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span className="daily-report-legend-swatch" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: ROUND_COLORS[i % ROUND_COLORS.length] }} />
                {round}차
              </span>
            ))}
          </div>
          <div style={{ position: 'relative', height: 220, marginBottom: 20 }}>
            <canvas ref={canvasRef} />
          </div>

          <p className="daily-report-table-title">TC별 결과 (차수 비교)</p>

          {(() => {
            const rounds = detail.rounds;
            const getLatestStatus = (tc: (typeof detail.testCases)[number]) => {
              for (let i = rounds.length - 1; i >= 0; i--) {
                const st = tc.byRound[rounds[i]];
                if (st) return st;
              }
              return undefined;
            };

            const searched = detail.testCases.filter(
              (tc) => !tcSearchText.trim() || tc.title.toLowerCase().includes(tcSearchText.trim().toLowerCase())
            );

            let visible = searched;
            let passedCount = 0;
            if (tcStatusFilter !== 'all') {
              visible = searched.filter((tc) => getLatestStatus(tc) === tcStatusFilter);
            } else {
              const passed = searched.filter((tc) => getLatestStatus(tc) === 'pass');
              passedCount = passed.length;
              visible = showPassedTc ? searched : searched.filter((tc) => getLatestStatus(tc) !== 'pass');
            }

            const filterBtnStyle = (active: boolean): CSSProperties => ({
              padding: '5px 12px',
              fontSize: 12.5,
              borderRadius: 6,
              border: active ? '1px solid #2a78d6' : '1px solid #ddd',
              background: active ? '#eaf2fc' : '#fff',
              color: active ? '#2a78d6' : '#555',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
            });

            return (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '10px 0' }}>
                  <button style={filterBtnStyle(tcStatusFilter === 'all')} onClick={() => setTcStatusFilter('all')}>전체</button>
                  <button style={filterBtnStyle(tcStatusFilter === 'fail')} onClick={() => setTcStatusFilter('fail')}>Fail만</button>
                  <button style={filterBtnStyle(tcStatusFilter === 'not_run')} onClick={() => setTcStatusFilter('not_run')}>미진행만</button>
                  <button style={filterBtnStyle(tcStatusFilter === 'blocked')} onClick={() => setTcStatusFilter('blocked')}>Blocked만</button>
                  <input
                    type="text"
                    value={tcSearchText}
                    onChange={(e) => setTcSearchText(e.target.value)}
                    placeholder="TC 제목 검색"
                    style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 13, border: '1px solid #ddd', borderRadius: 6, minWidth: 200 }}
                  />
                </div>

                <div className="daily-report-table-wrap" style={{ overflowX: 'auto' }}>
                  <table className="daily-report-table" style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ddd', minWidth: 220 }}>TC</th>
                        {rounds.map((round) => (
                          <th key={round} style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '2px solid #ddd', width: 70 }}>{round}차</th>
                        ))}
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #ddd', maxWidth: 260 }}>사유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.length === 0 && (
                        <tr>
                          <td colSpan={rounds.length + 2} style={{ padding: '16px 10px', textAlign: 'center', color: '#999' }}>
                            해당하는 TC가 없습니다.
                          </td>
                        </tr>
                      )}
                      {visible.map((tc) => (
                        <tr key={tc.id}>
                          <td style={{ padding: '8px 10px', borderBottom: '1px solid #eee', verticalAlign: 'top' }}>{tc.title}</td>
                          {rounds.map((round) => {
                            const status = tc.byRound[round];
                            return (
                              <td
                                key={round}
                                className={`tc-status-cell tc-status-${status ?? ''}`}
                                style={{
                                  padding: '8px 10px',
                                  borderBottom: '1px solid #eee',
                                  textAlign: 'center',
                                  verticalAlign: 'top',
                                  background: status ? STATUS_BG[status] : undefined,
                                  color: status ? STATUS_COLOR[status] : '#bbb',
                                  fontWeight: status === 'fail' ? 600 : 400,
                                }}
                              >
                                {status ? STATUS_LABEL[status] ?? status : '-'}
                              </td>
                            );
                          })}
                          <td
                            className="daily-report-note-cell"
                            title={tc.latestNote ?? ''}
                            style={{
                              padding: '8px 10px',
                              borderBottom: '1px solid #eee',
                              verticalAlign: 'top',
                              maxWidth: 260,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: '#666',
                            }}
                          >
                            {tc.latestNote ?? '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {tcStatusFilter === 'all' && passedCount > 0 && (
                  <button
                    onClick={() => setShowPassedTc((v) => !v)}
                    style={{ marginTop: 10, fontSize: 12.5, color: '#2a8f4d', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    {showPassedTc ? '▲ 정상 통과 TC 접기' : `✓ 정상 통과 ${passedCount}건 더 보기 ▾`}
                  </button>
                )}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}