import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { query } from '../db/client.js';

export interface ReportScope {
  from?: Date | null;
  to?: Date | null;
  project?: 'p1' | 'p2' | 'all';
}

async function getReportData(scope: ReportScope) {
  const { from, to } = scope;

  const [stats, projects, sections, feedbackSummary, recentVisitors, recentFeedback] = await Promise.all([
    query(`SELECT * FROM get_visitor_stats($1, $2)`, [from, to]),
    query(`SELECT * FROM get_project_popularity($1, $2)`, [from, to]),
    query(`SELECT * FROM get_most_viewed_sections($1, $2, 15)`, [from, to]),
    query(`SELECT * FROM get_feedback_summary($1, $2)`, [from, to]),
    query(
      `SELECT v.name, v.email, v.created_at, COUNT(s.id) as sessions
       FROM visitors v
       LEFT JOIN sessions s ON s.visitor_id = v.id
       WHERE ($1 IS NULL OR v.created_at >= $1) AND ($2 IS NULL OR v.created_at <= $2)
       GROUP BY v.id
       ORDER BY v.created_at DESC
       LIMIT 10`,
      [from, to]
    ),
    query(
      `SELECT v.name, v.email, f.rating, f.comment, f.created_at
       FROM feedback f
       JOIN visitors v ON v.id = f.visitor_id
       WHERE ($1 IS NULL OR f.created_at >= $1) AND ($2 IS NULL OR f.created_at <= $2)
       ORDER BY f.created_at DESC
       LIMIT 20`,
      [from, to]
    ),
  ]);

  return {
    period: {
      from: from?.toISOString().split('T')[0] || 'All time',
      to: to?.toISOString().split('T')[0] || 'Present',
      generatedAt: new Date().toISOString(),
    },
    overview: stats.rows[0] || {
      total_visitors: 0,
      unique_visitors: 0,
      total_sessions: 0,
      avg_session_duration: '0 seconds',
      total_feedback: 0,
      avg_rating: 0,
      total_downloads: 0,
    },
    projects: projects.rows,
    topSections: sections.rows,
    feedbackSummary: feedbackSummary.rows,
    recentVisitors: recentVisitors.rows,
    recentFeedback: recentFeedback.rows,
  };
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds === 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function drawTable(doc: PDFKit.PDFDocument, headers: string[], rows: string[][], x: number, y: number, colWidths: number[]) {
  const rowHeight = 20;
  const headerHeight = 25;

  // Header
  doc.font('Helvetica-Bold').fontSize(9);
  headers.forEach((h, i) => {
    doc.rect(x + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y, colWidths[i], headerHeight).fill('#194045');
    doc.fillColor('#fffdf7').text(h, x + colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 4, y + 7, {
      width: colWidths[i] - 8,
      align: 'left',
    });
  });

  // Rows
  doc.font('Helvetica').fontSize(8).fillColor('#211d16');
  rows.forEach((row, rowIdx) => {
    const rowY = y + headerHeight + rowIdx * rowHeight;
    if (rowIdx % 2 === 0) {
      doc.rect(x, rowY, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#f3eee1');
    }
    row.forEach((cell, i) => {
      doc.fillColor('#211d16').text(cell, x + colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 4, rowY + 5, {
        width: colWidths[i] - 8,
        align: 'left',
      });
    });
  });

  return y + headerHeight + rows.length * rowHeight + 15;
}

export async function generateEngagementReportPdf(scope: ReportScope): Promise<Buffer> {
  const data = await getReportData(scope);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.font('Helvetica-Bold').fontSize(24).fillColor('#0d2b2c')
      .text('Internship Engagement Report', 50, 50);

    doc.font('Helvetica').fontSize(11).fillColor('#57503f')
      .text(`Period: ${data.period.from} → ${data.period.to}`, 50, 80)
      .text(`Generated: ${new Date(data.period.generatedAt).toLocaleString()}`, 50, 95);

    // Overview Stats
    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0d2b2c').text('Executive Summary');

    const ov = data.overview;
    const stats = [
      ['Total Visitors', String(ov.total_visitors)],
      ['Unique Visitors (by email)', String(ov.unique_visitors)],
      ['Total Sessions', String(ov.total_sessions)],
      ['Avg Session Duration', formatDuration(
        ov.avg_session_duration ? parseInterval(ov.avg_session_duration as any) : 0
      )],
      ['Total Feedback Responses', String(ov.total_feedback)],
      ['Average Rating', ov.avg_rating ? `${Number(ov.avg_rating).toFixed(1)}/5.0` : 'N/A'],
      ['Report Downloads', String(ov.total_downloads)],
    ];

    let y = doc.y + 10;
    stats.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#194045').text(label, 50, y);
      doc.font('Helvetica').fontSize(10).fillColor('#211d16').text(value, 220, y);
      y += 20;
    });

    // Project Popularity
    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0d2b2c').text('Project Popularity');
    if (data.projects.length > 0) {
      y = drawTable(doc,
        ['Project', 'Views', 'Unique Visitors'],
        data.projects.map(p => [p.project, String(p.views), String(p.unique_visitors)]),
        50, doc.y,
        [150, 100, 120]
      );
      doc.y = y;
    } else {
      doc.font('Helvetica').fontSize(10).fillColor('#57503f').text('No project view data available.');
      doc.moveDown();
    }

    // Top Sections
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0d2b2c').text('Most Viewed Sections');
    if (data.topSections.length > 0) {
      y = drawTable(doc,
        ['Section', 'Views', 'Unique Visitors'],
        data.topSections.map(s => [s.section, String(s.views), String(s.unique_visitors)]),
        50, doc.y,
        [200, 100, 120]
      );
      doc.y = y;
    } else {
      doc.font('Helvetica').fontSize(10).fillColor('#57503f').text('No section view data available.');
      doc.moveDown();
    }

    // Feedback Summary
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0d2b2c').text('Feedback Summary');
    if (data.feedbackSummary.length > 0) {
      y = drawTable(doc,
        ['Rating', 'Count'],
        data.feedbackSummary.map(f => [String(f.rating), String(f.count)]),
        50, doc.y,
        [100, 100]
      );
      doc.y = y;
    } else {
      doc.font('Helvetica').fontSize(10).fillColor('#57503f').text('No feedback received yet.');
      doc.moveDown();
    }

    // Recent Visitors
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0d2b2c').text('Recent Visitors');
    if (data.recentVisitors.length > 0) {
      y = drawTable(doc,
        ['Name', 'Email', 'First Visit', 'Sessions'],
        data.recentVisitors.map(v => [
          v.name, v.email,
          new Date(v.created_at).toLocaleDateString(),
          String(v.sessions)
        ]),
        50, doc.y,
        [120, 180, 100, 70]
      );
      doc.y = y;
    }

    // Recent Feedback
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#0d2b2c').text('Recent Feedback');
    if (data.recentFeedback.length > 0) {
      data.recentFeedback.forEach(f => {
        if (doc.y > 700) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#194045')
          .text(`${f.name} (${f.email}) — ${'★'.repeat(f.rating)}${'☆'.repeat(5 - f.rating)}`);
        doc.font('Helvetica').fontSize(9).fillColor('#211d16')
          .text(f.comment || '(no comment)', { indent: 20 });
        doc.font('Helvetica').fontSize(8).fillColor('#57503f')
          .text(new Date(f.created_at).toLocaleString(), { indent: 20 });
        doc.moveDown(0.5);
      });
    } else {
      doc.font('Helvetica').fontSize(10).fillColor('#57503f').text('No feedback received yet.');
    }

    // Footer
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#9db3ac')
      .text('Generated by CIM Dashboard — Confidential', 50, 800, { align: 'center' });

    doc.end();
  });
}

export async function generateEngagementReportExcel(scope: ReportScope): Promise<Buffer> {
  const data = await getReportData(scope);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CIM Dashboard';
  workbook.created = new Date();

  // Overview Sheet
  const ovSheet = workbook.addWorksheet('Overview');
  ovSheet.columns = [
    { header: 'Metric', key: 'metric', width: 35 },
    { header: 'Value', key: 'value', width: 25 },
  ];
  const ov = data.overview;
  ovSheet.addRows([
    { metric: 'Reporting Period', value: `${data.period.from} → ${data.period.to}` },
    { metric: 'Generated At', value: data.period.generatedAt },
    { metric: '', value: '' },
    { metric: 'Total Visitors', value: ov.total_visitors },
    { metric: 'Unique Visitors', value: ov.unique_visitors },
    { metric: 'Total Sessions', value: ov.total_sessions },
    { metric: 'Avg Session Duration', value: formatDuration(
      ov.avg_session_duration ? parseInterval(ov.avg_session_duration as any) : 0
    ) },
    { metric: 'Total Feedback', value: ov.total_feedback },
    { metric: 'Average Rating', value: ov.avg_rating ? Number(ov.avg_rating).toFixed(1) : 'N/A' },
    { metric: 'Report Downloads', value: ov.total_downloads },
  ]);
  ovSheet.getRow(1).font = { bold: true };
  ovSheet.getRow(4).font = { bold: true };

  // Projects Sheet
  const projSheet = workbook.addWorksheet('Project Popularity');
  projSheet.columns = [
    { header: 'Project', key: 'project', width: 20 },
    { header: 'Views', key: 'views', width: 15 },
    { header: 'Unique Visitors', key: 'unique_visitors', width: 20 },
  ];
  data.projects.forEach(p => projSheet.addRow(p));
  projSheet.getRow(1).font = { bold: true };

  // Sections Sheet
  const secSheet = workbook.addWorksheet('Top Sections');
  secSheet.columns = [
    { header: 'Section', key: 'section', width: 40 },
    { header: 'Views', key: 'views', width: 15 },
    { header: 'Unique Visitors', key: 'unique_visitors', width: 20 },
  ];
  data.topSections.forEach(s => secSheet.addRow(s));
  secSheet.getRow(1).font = { bold: true };

  // Feedback Summary Sheet
  const fbSheet = workbook.addWorksheet('Feedback Summary');
  fbSheet.columns = [
    { header: 'Rating', key: 'rating', width: 10 },
    { header: 'Count', key: 'count', width: 15 },
  ];
  data.feedbackSummary.forEach(f => fbSheet.addRow(f));
  fbSheet.getRow(1).font = { bold: true };

  // Recent Visitors Sheet
  const rvSheet = workbook.addWorksheet('Recent Visitors');
  rvSheet.columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Email', key: 'email', width: 35 },
    { header: 'First Visit', key: 'created_at', width: 20 },
    { header: 'Sessions', key: 'sessions', width: 12 },
  ];
  data.recentVisitors.forEach(v => rvSheet.addRow({
    ...v, created_at: new Date(v.created_at).toLocaleDateString()
  }));
  rvSheet.getRow(1).font = { bold: true };

  // Recent Feedback Sheet
  const rfSheet = workbook.addWorksheet('Recent Feedback');
  rfSheet.columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'Email', key: 'email', width: 35 },
    { header: 'Rating', key: 'rating', width: 10 },
    { header: 'Comment', key: 'comment', width: 60 },
    { header: 'Date', key: 'created_at', width: 20 },
  ];
  data.recentFeedback.forEach(f => rfSheet.addRow({
    ...f, created_at: new Date(f.created_at).toLocaleString()
  }));
  rfSheet.getRow(1).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function parseInterval(interval: string | { seconds?: number; minutes?: number; hours?: number }): number {
  if (typeof interval === 'number') return interval;
  if (typeof interval === 'object' && interval.seconds !== undefined) {
    return (interval.hours || 0) * 3600 + (interval.minutes || 0) * 60 + interval.seconds;
  }
  // Parse PostgreSQL interval string like "00:15:30"
  const match = String(interval).match(/(\d+):(\d+):(\d+)/);
  if (match) {
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
  }
  return 0;
}