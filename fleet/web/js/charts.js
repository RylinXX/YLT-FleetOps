/**
 * Charts Engine for FleetMaster with Adaptive Dark / Light Themes
 * Powered by Apache ECharts 5
 */

const ChartEngine = {
  instances: {},
  isDark: false,

  setTheme(isDark) {
    this.isDark = isDark;
  },

  getColors() {
    const isDark = this.isDark;
    return {
      isDark,
      primary: '#6366f1',
      primaryLight: '#818cf8',
      primaryDark: '#4f46e5',
      emerald: '#10b981',
      emeraldLight: '#34d399',
      amber: '#f59e0b',
      amberLight: '#fbbf24',
      rose: '#f43f5e',
      purple: '#8b5cf6',
      cyan: '#06b6d4',
      textMuted: isDark ? '#94a3b8' : '#64748b',
      textMain: isDark ? '#f8fafc' : '#0f172a',
      border: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
      gridLine: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
      tooltipBg: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)',
      tooltipBorder: isDark ? 'rgba(99, 102, 241, 0.4)' : '#cbd5e1',
      tooltipText: isDark ? '#f8fafc' : '#0f172a'
    };
  },

  init(domId) {
    const el = document.getElementById(domId);
    if (!el) return null;
    if (this.instances[domId]) {
      try {
        this.instances[domId].dispose();
      } catch (e) {}
    }
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    this.instances[domId] = chart;
    return chart;
  },

  resizeAll() {
    Object.values(this.instances).forEach(chart => {
      if (chart && !chart.isDisposed()) {
        try {
          chart.resize();
        } catch (e) {}
      }
    });
  },

  // 1. 每日车次与产值双轴走势图
  renderDailyTrendChart(domId, trendData) {
    const chart = this.init(domId);
    if (!chart || !trendData || trendData.length === 0) return;

    const C = this.getColors();
    const dates = trendData.map(d => d.date.slice(5));
    const trips = trendData.map(d => d.trips);
    const revenues = trendData.map(d => d.revenue);

    const ma7Revenue = revenues.map((val, idx, arr) => {
      const start = Math.max(0, idx - 6);
      const slice = arr.slice(start, idx + 1);
      const sum = slice.reduce((a, b) => a + b, 0);
      return Math.round(sum / slice.length);
    });

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross', crossStyle: { color: C.textMuted } },
        backgroundColor: C.tooltipBg,
        borderColor: C.tooltipBorder,
        borderWidth: 1,
        shadowBlur: 10,
        shadowColor: C.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.08)',
        textStyle: { color: C.tooltipText },
        formatter: (params) => {
          const item = trendData[params[0].dataIndex];
          if (!item) return '';
          return `
            <div style="font-weight:bold; color:#6366f1; margin-bottom:4px;">${item.date} 运营数据</div>
            <div style="font-size:12px; line-height:1.6; color:${C.tooltipText};">
              <div>🚚 出车车次: <b>${item.trips} 车</b></div>
              <div>💰 当日产值: <b style="color:#f59e0b;">¥${item.revenue.toLocaleString()} 元</b></div>
              <div>👥 在岗司机: <b style="color:#10b981;">${item.drivers_count} 人</b> | 🚛 出勤车辆: <b style="color:#8b5cf6;">${item.vehicles_count} 辆</b></div>
            </div>
          `;
        }
      },
      legend: {
        data: ['当日出车车次', '当日产值 (元)', '7日均线 (元)'],
        textStyle: { color: C.textMuted },
        top: 0,
        right: 10
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '8%',
        top: '15%',
        containLabel: true
      },
      xAxis: [{
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: C.border } },
        axisLabel: { color: C.textMuted, fontSize: 11 },
        axisTick: { alignWithLabel: true }
      }],
      yAxis: [
        {
          type: 'value',
          name: '车次 (车)',
          nameTextStyle: { color: C.textMuted, fontSize: 11 },
          axisLabel: { color: C.textMuted, fontSize: 11 },
          splitLine: { lineStyle: { color: C.gridLine } }
        },
        {
          type: 'value',
          name: '产值 (元)',
          nameTextStyle: { color: C.textMuted, fontSize: 11 },
          axisLabel: {
            color: C.textMuted,
            fontSize: 11,
            formatter: (v) => `¥${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`
          },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '当日出车车次',
          type: 'bar',
          barMaxWidth: 18,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#6366f1' },
              { offset: 1, color: C.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.4)' }
            ])
          },
          data: trips
        },
        {
          name: '当日产值 (元)',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 3, color: '#f59e0b' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: C.isDark ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.2)' },
              { offset: 1, color: 'rgba(245, 158, 11, 0.0)' }
            ])
          },
          data: revenues
        },
        {
          name: '7日均线 (元)',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, type: 'dashed', color: '#10b981' },
          data: ma7Revenue
        }
      ]
    };

    chart.setOption(option);
  },

  // 2. 司机产值排行榜
  renderDriverRankingChart(domId, driverData) {
    const chart = this.init(domId);
    if (!chart || !driverData || driverData.length === 0) return;

    const C = this.getColors();
    const top10 = driverData.slice(0, 10).reverse();
    const drivers = top10.map(d => d.driver);
    const revenues = top10.map(d => d.revenue);

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: C.tooltipBg,
        borderColor: C.tooltipBorder,
        borderWidth: 1,
        shadowBlur: 10,
        shadowColor: C.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.08)',
        textStyle: { color: C.tooltipText },
        formatter: (params) => {
          const item = top10[params[0].dataIndex];
          if (!item) return '';
          return `
            <div style="font-weight:bold; color:#10b981; margin-bottom:4px;">${item.driver} - 产值详情</div>
            <div style="font-size:12px; line-height:1.6; color:${C.tooltipText};">
              <div>💰 累计产值: <b style="color:#f59e0b;">¥${item.revenue.toLocaleString()} 元</b></div>
              <div>🚚 累计车次: <b>${item.trips} 车</b></div>
              <div>📅 出勤天数: <span style="color:#6366f1;">${item.days} 天</span> | 日均: <span style="color:#10b981;">¥${item.daily_revenue}</span></div>
            </div>
          `;
        }
      },
      grid: {
        left: '3%',
        right: '15%',
        bottom: '4%',
        top: '4%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        axisLabel: {
          color: C.textMuted,
          fontSize: 11,
          formatter: (v) => `¥${(v / 1000).toFixed(0)}k`
        },
        splitLine: { lineStyle: { color: C.gridLine } }
      },
      yAxis: {
        type: 'category',
        data: drivers,
        axisLine: { lineStyle: { color: C.border } },
        axisLabel: { color: C.textMain, fontWeight: 'bold', fontSize: 12 }
      },
      series: [
        {
          name: '总产值 (元)',
          type: 'bar',
          barMaxWidth: 16,
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: (params) => {
              const idx = params.dataIndex;
              if (idx >= top10.length - 3) {
                return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: '#f59e0b' },
                  { offset: 1, color: '#fbbf24' }
                ]);
              }
              return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: '#6366f1' },
                { offset: 1, color: '#818cf8' }
              ]);
            }
          },
          label: {
            show: true,
            position: 'right',
            color: C.textMain,
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: 11,
            formatter: (p) => `¥${(p.value / 1000).toFixed(1)}k`
          },
          data: revenues
        }
      ]
    };

    chart.setOption(option);
  },

  // 3. 土点物料产值占比
  renderSiteBreakdownChart(domId, siteData) {
    const chart = this.init(domId);
    if (!chart || !siteData || siteData.length === 0) return;

    const C = this.getColors();
    const top8 = siteData.slice(0, 8);
    const othersRevenue = siteData.slice(8).reduce((sum, item) => sum + item.revenue, 0);
    const othersTrips = siteData.slice(8).reduce((sum, item) => sum + item.trips, 0);

    const pieData = top8.map(s => ({
      name: s.name,
      value: s.revenue,
      trips: s.trips
    }));

    if (othersRevenue > 0) {
      pieData.push({
        name: '其他土点合计',
        value: othersRevenue,
        trips: othersTrips
      });
    }

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: C.tooltipBg,
        borderColor: C.tooltipBorder,
        borderWidth: 1,
        shadowBlur: 10,
        shadowColor: C.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.08)',
        textStyle: { color: C.tooltipText },
        formatter: (params) => {
          const d = params.data;
          if (!d) return '';
          return `
            <div style="font-weight:bold; color:#8b5cf6; margin-bottom:4px;">${d.name}</div>
            <div style="font-size:12px; line-height:1.6; color:${C.tooltipText};">
              <div>💰 产值总计: <b style="color:#f59e0b;">¥${d.value.toLocaleString()} 元</b></div>
              <div>🚚 累计车次: <b>${d.trips} 车</b></div>
              <div>📊 产值占比: <b style="color:#10b981;">${params.percent}%</b></div>
            </div>
          `;
        }
      },
      legend: {
        orient: 'vertical',
        right: '2%',
        top: 'middle',
        textStyle: { color: C.textMuted, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10
      },
      series: [
        {
          name: '土点产值贡献',
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['38%', '50%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 6,
            borderColor: C.isDark ? '#060813' : '#ffffff',
            borderWidth: 2
          },
          label: { show: false },
          emphasis: {
            label: {
              show: true,
              fontSize: 13,
              fontWeight: 'bold',
              color: C.textMain,
              formatter: '{b}\n¥{c}'
            }
          },
          labelLine: { show: false },
          data: pieData
        }
      ]
    };

    chart.setOption(option);
  },

  // 4. 车辆效能对比
  renderVehicleStatsChart(domId, vehicleStats) {
    const chart = this.init(domId);
    if (!chart || !vehicleStats || vehicleStats.length === 0) return;

    const C = this.getColors();
    const vehicles = vehicleStats.map(v => v.vehicle.replace('京', ''));
    const revenues = vehicleStats.map(v => v.revenue);
    const dailyTrips = vehicleStats.map(v => v.daily_trips);

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: C.tooltipBg,
        borderColor: C.tooltipBorder,
        borderWidth: 1,
        shadowBlur: 10,
        shadowColor: C.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.08)',
        textStyle: { color: C.tooltipText },
        formatter: (params) => {
          const item = vehicleStats[params[0].dataIndex];
          if (!item) return '';
          return `
            <div style="font-weight:bold; color:#6366f1; margin-bottom:4px;">车辆 ${item.vehicle} 效能档案</div>
            <div style="font-size:12px; line-height:1.6; color:${C.tooltipText};">
              <div>💰 累计产值: <b style="color:#f59e0b;">¥${item.revenue.toLocaleString()} 元</b></div>
              <div>🚚 累计车次: <b>${item.trips} 车</b></div>
              <div>📅 出勤天数: <span style="color:#10b981;">${item.days_active} 天</span></div>
              <div>⚡ 单车日均: <b style="color:#8b5cf6;">${item.daily_trips} 车/天</b></div>
            </div>
          `;
        }
      },
      legend: {
        data: ['累计产值 (元)', '单车日均车次'],
        textStyle: { color: C.textMuted },
        top: 0,
        right: 10
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '8%',
        top: '15%',
        containLabel: true
      },
      xAxis: [{
        type: 'category',
        data: vehicles,
        axisLine: { lineStyle: { color: C.border } },
        axisLabel: { color: C.textMuted, fontSize: 10, rotate: 25 }
      }],
      yAxis: [
        {
          type: 'value',
          name: '产值 (元)',
          nameTextStyle: { color: C.textMuted, fontSize: 11 },
          axisLabel: {
            color: C.textMuted,
            fontSize: 11,
            formatter: (v) => `¥${(v / 1000).toFixed(0)}k`
          },
          splitLine: { lineStyle: { color: C.gridLine } }
        },
        {
          type: 'value',
          name: '日均车次 (车/天)',
          nameTextStyle: { color: C.textMuted, fontSize: 11 },
          axisLabel: { color: C.textMuted, fontSize: 11 },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '累计产值 (元)',
          type: 'bar',
          barMaxWidth: 16,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#8b5cf6' },
              { offset: 1, color: C.isDark ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.4)' }
            ])
          },
          data: revenues
        },
        {
          name: '单车日均车次',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          lineStyle: { width: 3, color: '#06b6d4' },
          itemStyle: { color: '#06b6d4' },
          data: dailyTrips
        }
      ]
    };

    chart.setOption(option);
  },

  // 5. 司机公平绩效离散度散点图
  renderFairIndexScatterChart(domId, rankings) {
    const chart = this.init(domId);
    if (!chart || !rankings || rankings.length === 0) return;

    const C = this.getColors();
    const scatterData = rankings.map(r => [
      r.days,
      r.fair_perf_index,
      r.total_amount,
      r.driver,
      r.overall_eval,
      r.confirmed_trips
    ]);

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: C.tooltipBg,
        borderColor: C.tooltipBorder,
        borderWidth: 1,
        shadowBlur: 10,
        shadowColor: C.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.08)',
        textStyle: { color: C.tooltipText },
        formatter: (params) => {
          const [days, idx, amount, drv, rating, trips] = params.data;
          return `
            <div style="font-weight:bold; color:#6366f1; margin-bottom:4px;">${drv} (评级: ${rating})</div>
            <div style="font-size:12px; line-height:1.6; color:${C.tooltipText};">
              <div>⚖️ 公平绩效指数: <b style="color:#f59e0b;">${(idx * 100).toFixed(1)}%</b></div>
              <div>📅 出勤天数: <b>${days} 天</b></div>
              <div>💰 总产值: <span style="color:#10b981;">¥${amount.toLocaleString()} 元</span></div>
              <div>🚚 确认车次: <span style="color:#8b5cf6;">${trips} 车</span></div>
            </div>
          `;
        }
      },
      grid: {
        left: '4%',
        right: '8%',
        bottom: '8%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        name: '出勤天数 (天)',
        nameTextStyle: { color: C.textMuted, fontSize: 11 },
        type: 'value',
        min: 0,
        axisLine: { lineStyle: { color: C.border } },
        axisLabel: { color: C.textMuted, fontSize: 11 },
        splitLine: { lineStyle: { color: C.gridLine } }
      },
      yAxis: {
        name: '公平人效指数 (1.0 = 团队基准)',
        nameTextStyle: { color: C.textMuted, fontSize: 11 },
        type: 'value',
        min: 0.8,
        max: 1.25,
        axisLine: { lineStyle: { color: C.border } },
        axisLabel: {
          color: C.textMuted,
          fontSize: 11,
          formatter: (v) => `${(v * 100).toFixed(0)}%`
        },
        splitLine: { lineStyle: { color: C.gridLine } }
      },
      series: [
        {
          name: '基准线(100%)',
          type: 'line',
          markLine: {
            silent: true,
            lineStyle: { color: C.isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)', type: 'dashed' },
            data: [
              { yAxis: 1.05, label: { formatter: '较高线 105%', color: '#10b981', position: 'end' } },
              { yAxis: 1.0, label: { formatter: '基准线 100%', color: '#6366f1', position: 'end' } },
              { yAxis: 0.95, label: { formatter: '偏低线 95%', color: '#f59e0b', position: 'end' } }
            ]
          }
        },
        {
          name: '司机分布',
          type: 'scatter',
          symbolSize: (data) => {
            const amt = data[2];
            return Math.max(12, Math.min(36, Math.sqrt(amt / 100)));
          },
          itemStyle: {
            color: (params) => {
              const rating = params.data[4];
              if (rating === '较高') return '#10b981';
              if (rating === '偏低') return '#f59e0b';
              return '#6366f1';
            },
            shadowBlur: 8,
            shadowColor: C.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.12)'
          },
          label: {
            show: true,
            formatter: (p) => p.data[3],
            position: 'top',
            color: C.textMain,
            fontSize: 11,
            fontWeight: 'bold'
          },
          data: scatterData
        }
      ]
    };

    chart.setOption(option);
  },

  // 6. 司机档案专属图表 (个人产值与车次走势)
  renderDriverDetailTimeline(domId, timelineData) {
    const chart = this.init(domId);
    if (!chart || !timelineData || timelineData.length === 0) return;

    const C = this.getColors();
    const dates = timelineData.map(d => d.date.slice(5));
    const amounts = timelineData.map(d => d.daily_amount);
    const trips = timelineData.map(d => d.trips);

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: C.tooltipBg,
        borderColor: C.tooltipBorder,
        borderWidth: 1,
        shadowBlur: 10,
        shadowColor: C.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.08)',
        textStyle: { color: C.tooltipText },
        formatter: (params) => {
          const item = timelineData[params[0].dataIndex];
          if (!item) return '';
          return `
            <div style="font-weight:bold; color:#6366f1; margin-bottom:4px;">${item.date} 驾驶【${item.vehicle}】</div>
            <div style="font-size:12px; line-height:1.6; color:${C.tooltipText};">
              <div>💰 当日产值: <b style="color:#f59e0b;">¥${item.daily_amount} 元</b></div>
              <div>🚚 出车车次: <b>${item.trips} 车</b></div>
              <div>⚖️ 相对指数: <b style="color:#10b981;">${(item.fair_perf_index * 100).toFixed(1)}%</b> (${item.rating})</div>
            </div>
          `;
        }
      },
      grid: {
        left: '4%',
        right: '4%',
        bottom: '8%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLine: { lineStyle: { color: C.border } },
        axisLabel: { color: C.textMuted, fontSize: 10 }
      },
      yAxis: [
        {
          type: 'value',
          name: '产值 (元)',
          nameTextStyle: { color: C.textMuted, fontSize: 11 },
          axisLabel: { color: C.textMuted, fontSize: 11 },
          splitLine: { lineStyle: { color: C.gridLine } }
        },
        {
          type: 'value',
          name: '车次 (车)',
          nameTextStyle: { color: C.textMuted, fontSize: 11 },
          axisLabel: { color: C.textMuted, fontSize: 11 },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '当日产值',
          type: 'bar',
          barMaxWidth: 14,
          itemStyle: {
            borderRadius: [3, 3, 0, 0],
            color: '#6366f1'
          },
          data: amounts
        },
        {
          name: '出车车次',
          type: 'line',
          yAxisIndex: 1,
          smooth: true,
          lineStyle: { width: 2, color: '#10b981' },
          itemStyle: { color: '#10b981' },
          data: trips
        }
      ]
    };

    chart.setOption(option);
  },

  // 7. 司机档案土点分布
  renderDriverDetailSiteDonut(domId, siteData) {
    const chart = this.init(domId);
    if (!chart || !siteData || siteData.length === 0) return;

    const C = this.getColors();
    const data = siteData.map(s => ({
      name: s.site,
      value: s.revenue,
      trips: s.trips
    }));

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: C.tooltipBg,
        borderColor: C.tooltipBorder,
        borderWidth: 1,
        shadowBlur: 10,
        shadowColor: C.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.08)',
        textStyle: { color: C.tooltipText },
        formatter: '{b}: ¥{c} ({d}%)<br/>车次: {c} 车'
      },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          center: ['50%', '50%'],
          itemStyle: {
            borderRadius: 4,
            borderColor: C.isDark ? '#060813' : '#ffffff',
            borderWidth: 2
          },
          label: {
            show: true,
            color: C.textMain,
            fontSize: 11,
            formatter: '{b}'
          },
          data: data
        }
      ]
    };

    chart.setOption(option);
  },

  // 8. 每日司机标车对比与均值分布图
  renderDailyDriverBarChart(domId, rankings, avgStandardTrips) {
    const chart = this.init(domId);
    if (!chart || !rankings || rankings.length === 0) return;

    const C = this.getColors();
    const sorted = [...rankings].reverse();
    const drivers = sorted.map(d => d.driver);
    const standardTrips = sorted.map(d => d.standard_trips);

    const option = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: C.tooltipBg,
        borderColor: C.tooltipBorder,
        borderWidth: 1,
        shadowBlur: 10,
        shadowColor: C.isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.08)',
        textStyle: { color: C.tooltipText },
        formatter: (params) => {
          const item = sorted[params[0].dataIndex];
          if (!item) return '';
          let detailHtml = (item.details || []).map(d => `<div>• ${d.site_label}: <b>${d.trips}车</b> (¥${d.amount})</div>`).join('');
          return `
            <div style="font-weight:bold; color:#6366f1; margin-bottom:4px;">#${item.rank} ${item.driver} (${item.vehicle_display})</div>
            <div style="font-size:12px; line-height:1.6; color:${C.tooltipText};">
              <div>⚡ 折算标车: <b style="color:#f59e0b; font-size:14px;">${item.standard_trips} 标车</b> (实际 ${item.trips_actual} 车)</div>
              <div>💰 当日产值: <b style="color:#10b981;">¥${item.total_amount.toLocaleString()} 元</b></div>
              <div>⚖️ 相对均值: <b style="color:${item.vs_avg_percent >= 0 ? '#10b981' : '#f59e0b'};">${item.vs_avg_percent >= 0 ? '+' : ''}${item.vs_avg_percent}%</b> [${item.tier}]</div>
              <div style="margin-top:4px; padding-top:4px; border-top:1px dashed ${C.border}; font-size:11px; color:${C.textMuted};">
                ${detailHtml}
              </div>
            </div>
          `;
        }
      },
      grid: {
        left: '4%',
        right: '15%',
        bottom: '5%',
        top: '6%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: '等效标车 (车)',
        nameTextStyle: { color: C.textMuted, fontSize: 11 },
        axisLabel: { color: C.textMuted, fontSize: 11 },
        splitLine: { lineStyle: { color: C.gridLine } }
      },
      yAxis: {
        type: 'category',
        data: drivers,
        axisLine: { lineStyle: { color: C.border } },
        axisLabel: { color: C.textMain, fontWeight: 'bold', fontSize: 12 }
      },
      series: [
        {
          name: '当日等效标车',
          type: 'bar',
          barMaxWidth: 18,
          itemStyle: {
            borderRadius: [0, 5, 5, 0],
            color: (params) => {
              const item = sorted[params.dataIndex];
              if (!item) return '#6366f1';
              if (item.tier === '较高') {
                return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: '#10b981' },
                  { offset: 1, color: '#34d399' }
                ]);
              }
              if (item.tier === '偏低') {
                return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                  { offset: 0, color: '#f59e0b' },
                  { offset: 1, color: '#fbbf24' }
                ]);
              }
              return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: '#6366f1' },
                { offset: 1, color: '#818cf8' }
              ]);
            }
          },
          label: {
            show: true,
            position: 'right',
            color: C.textMain,
            fontFamily: 'monospace',
            fontWeight: 'bold',
            fontSize: 12,
            formatter: (p) => `${p.value} 标车`
          },
          markLine: {
            silent: true,
            lineStyle: { color: '#f43f5e', width: 2, type: 'dashed' },
            data: [
              {
                xAxis: avgStandardTrips,
                label: {
                  formatter: `当日均值: ${avgStandardTrips} 标车`,
                  color: '#f43f5e',
                  position: 'end',
                  fontSize: 11,
                  fontWeight: 'bold'
                }
              }
            ]
          },
          data: standardTrips
        }
      ]
    };

    chart.setOption(option);
  }
};

window.addEventListener('resize', () => {
  ChartEngine.resizeAll();
});
