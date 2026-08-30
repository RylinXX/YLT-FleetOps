/**
 * FleetMaster Core Web Application
 * Clean Reactive Vue 3 Composition Architecture with Zero-Latency Two-Way Theme Sync
 */

const { createApp, ref, computed, onMounted, nextTick, watch } = Vue;

const app = createApp({
  setup() {
    // ==========================================
    // 1. Navigation & Period State
    // ==========================================
    const currentTab = ref('overview');
    const currentPeriod = ref('all'); // 'all' | 'july' | 'aug' | 'custom'
    const customStartDate = ref('2026-07-03');
    const customEndDate = ref('2026-08-28');

    const loading = ref(false);
    const toast = ref({ show: false, message: '', type: 'info' });

    function showToast(msg, type = 'success') {
      toast.value = { show: true, message: msg, type };
      setTimeout(() => {
        toast.value.show = false;
      }, 3500);
    }

    // ==========================================
    // 2. Theme State (Parent ylt.etgq.com Synchronized)
    // ==========================================
    const currentTheme = ref('light');

    function applyTheme(theme) {
      if (!theme) theme = 'light';
      currentTheme.value = theme;
      const isDark = (theme === 'dark');
      
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.setAttribute('data-theme', 'light');
      }
      
      try {
        localStorage.setItem('theme', theme);
        sessionStorage.setItem('theme', theme);
      } catch (e) {}

      ChartEngine.setTheme(isDark);

      nextTick(() => {
        if (currentTab.value === 'overview') {
          renderOverviewCharts();
        } else if (currentTab.value === 'daily') {
          renderDailyChart();
        }
        if (activeDriverModal.value && driverProfile.value) {
          ChartEngine.renderDriverDetailTimeline('chart-driver-timeline', driverProfile.value.daily_timeline);
          ChartEngine.renderDriverDetailSiteDonut('chart-driver-donut', driverProfile.value.site_breakdown);
        }
      });
    }

    // ==========================================
    // 3. Digital Big Screen (Overview) State & Methods
    // ==========================================
    const overviewData = ref({
      kpis: {},
      trends: [],
      site_ranking: [],
      vehicle_stats: [],
      driver_chart_data: []
    });

    async function fetchOverview() {
      loading.value = true;
      try {
        let url = `/api/fleet/overview?period=${currentPeriod.value}`;
        if (currentPeriod.value === 'custom') {
          url += `&start_date=${customStartDate.value}&end_date=${customEndDate.value}`;
        }
        let res = await fetch(url);
        if (!res.ok) res = await fetch(url.replace('/api/fleet', '/api'));
        const data = await res.json();
        overviewData.value = data;

        await nextTick();
        renderOverviewCharts();
      } catch (err) {
        console.error("Fetch overview error:", err);
        showToast("获取看板数据失败", "error");
      } finally {
        loading.value = false;
      }
    }

    function renderOverviewCharts() {
      if (currentTab.value !== 'overview') return;
      if (overviewData.value.trends && overviewData.value.trends.length > 0) {
        ChartEngine.renderDailyTrendChart('chart-daily-trend', overviewData.value.trends);
      }
      if (overviewData.value.driver_chart_data && overviewData.value.driver_chart_data.length > 0) {
        ChartEngine.renderDriverRankingChart('chart-driver-ranking', overviewData.value.driver_chart_data);
      }
      if (overviewData.value.site_ranking && overviewData.value.site_ranking.length > 0) {
        ChartEngine.renderSiteBreakdownChart('chart-site-breakdown', overviewData.value.site_ranking);
      }
      if (overviewData.value.vehicle_stats && overviewData.value.vehicle_stats.length > 0) {
        ChartEngine.renderVehicleStatsChart('chart-vehicle-stats', overviewData.value.vehicle_stats);
      }
      if (rankingsData.value.rankings && rankingsData.value.rankings.length > 0) {
        ChartEngine.renderFairIndexScatterChart('chart-fair-scatter', rankingsData.value.rankings);
      }
    }

    // ==========================================
    // 4. Daily Leaderboard State & Methods
    // ==========================================
    const dailyRankingData = ref({
      date: '',
      benchmark_price: 250,
      available_dates: [],
      daily_summary: {},
      rankings: []
    });
    const selectedDailyDate = ref('');
    const dailyRatingFilter = ref('all');
    const dailyDriverSearch = ref('');

    const filteredDailyRankings = computed(() => {
      let list = dailyRankingData.value.rankings || [];
      if (dailyRatingFilter.value !== 'all') {
        list = list.filter(d => d.tier === dailyRatingFilter.value);
      }
      if (dailyDriverSearch.value.trim()) {
        const kw = dailyDriverSearch.value.trim().toLowerCase();
        list = list.filter(d => d.driver.toLowerCase().includes(kw) || d.vehicle_display.toLowerCase().includes(kw));
      }
      return list;
    });

    async function fetchDailyRanking(targetDate) {
      loading.value = true;
      try {
        let url = '/api/fleet/daily-ranking';
        if (targetDate) {
          url += `?date=${encodeURIComponent(targetDate)}`;
        }
        let res = await fetch(url);
        if (!res.ok) res = await fetch(url.replace('/api/fleet', '/api'));
        const data = await res.json();
        dailyRankingData.value = data;
        selectedDailyDate.value = data.date;

        await nextTick();
        renderDailyChart();
      } catch (err) {
        console.error("Fetch daily ranking error:", err);
        showToast("获取每日战报数据失败", "error");
      } finally {
        loading.value = false;
      }
    }

    function renderDailyChart() {
      if (currentTab.value !== 'daily') return;
      if (dailyRankingData.value.rankings && dailyRankingData.value.rankings.length > 0) {
        ChartEngine.renderDailyDriverBarChart(
          'chart-daily-driver-bars',
          dailyRankingData.value.rankings,
          dailyRankingData.value.daily_summary.avg_standard_trips || 0
        );
      }
    }

    function prevDailyDate() {
      const dates = dailyRankingData.value.available_dates || [];
      const currIdx = dates.indexOf(selectedDailyDate.value);
      if (currIdx !== -1 && currIdx < dates.length - 1) {
        fetchDailyRanking(dates[currIdx + 1]);
      }
    }

    function nextDailyDate() {
      const dates = dailyRankingData.value.available_dates || [];
      const currIdx = dates.indexOf(selectedDailyDate.value);
      if (currIdx !== -1 && currIdx > 0) {
        fetchDailyRanking(dates[currIdx - 1]);
      }
    }

    // ==========================================
    // 5. Driver Fair Rankings State & Methods
    // ==========================================
    const rankingsData = ref({ period: '7-8月全期', rankings: [] });
    const driverSearch = ref('');
    const driverRatingFilter = ref('all');

    const filteredRankings = computed(() => {
      let list = rankingsData.value.rankings || [];
      if (driverRatingFilter.value !== 'all') {
        list = list.filter(d => d.overall_eval === driverRatingFilter.value);
      }
      if (driverSearch.value.trim()) {
        const kw = driverSearch.value.trim().toLowerCase();
        list = list.filter(d => d.driver.toLowerCase().includes(kw));
      }
      return list;
    });

    async function fetchRankings() {
      try {
        let url = `/api/fleet/rankings?period=${currentPeriod.value}`;
        let res = await fetch(url);
        if (!res.ok) res = await fetch(url.replace('/api/fleet', '/api'));
        const data = await res.json();
        rankingsData.value = data;
        if (currentTab.value === 'overview') {
          await nextTick();
          ChartEngine.renderFairIndexScatterChart('chart-fair-scatter', data.rankings);
        }
      } catch (err) {
        console.error("Fetch rankings error:", err);
      }
    }

    const activeDriverModal = ref(false);
    const driverProfile = ref(null);
    const driverProfileLoading = ref(false);

    async function openDriverProfile(driverName) {
      activeDriverModal.value = true;
      driverProfileLoading.value = true;
      try {
        let url = `/api/fleet/driver/${encodeURIComponent(driverName)}`;
        let res = await fetch(url);
        if (!res.ok) res = await fetch(url.replace('/api/fleet', '/api'));
        if (!res.ok) throw new Error("Driver not found");
        const data = await res.json();
        driverProfile.value = data;

        await nextTick();
        ChartEngine.renderDriverDetailTimeline('chart-driver-timeline', data.daily_timeline);
        ChartEngine.renderDriverDetailSiteDonut('chart-driver-donut', data.site_breakdown);
      } catch (err) {
        console.error("Error loading driver profile:", err);
        showToast("无法加载司机档案", "error");
      } finally {
        driverProfileLoading.value = false;
      }
    }

    // ==========================================
    // 6. Pricing Rules State & Methods
    // ==========================================
    const pricingRules = ref([]);
    const pricingSearch = ref('');
    const pricingTotalRevenue = ref(0);
    const pricingInitialTotal = ref(0);
    const modifiedRules = ref({});

    const filteredPricingRules = computed(() => {
      let list = pricingRules.value || [];
      if (pricingSearch.value.trim()) {
        const kw = pricingSearch.value.trim().toLowerCase();
        list = list.filter(r => r.key.toLowerCase().includes(kw) || r.site.toLowerCase().includes(kw) || r.description.toLowerCase().includes(kw));
      }
      return list;
    });

    async function fetchPricingRules() {
      try {
        let res = await fetch('/api/fleet/pricing-rules');
        if (!res.ok) res = await fetch('/api/pricing-rules');
        const data = await res.json();
        pricingRules.value = data.pricing_rules;
        pricingTotalRevenue.value = data.total_revenue;
        if (!pricingInitialTotal.value) {
          pricingInitialTotal.value = data.total_revenue;
        }
        modifiedRules.value = {};
      } catch (err) {
        console.error("Error fetching pricing rules:", err);
      }
    }

    function onPriceInputChange(rule, event) {
      const val = parseFloat(event.target.value);
      if (!isNaN(val) && val >= 0) {
        modifiedRules.value[rule.key] = val;
        rule.price = val;
      }
    }

    async function savePricingRules() {
      const updates = Object.entries(modifiedRules.value).map(([key, price]) => ({ key, price }));
      if (updates.length === 0) {
        showToast("没有检测到需要保存的价格变更", "info");
        return;
      }
      loading.value = true;
      try {
        let res = await fetch('/api/fleet/pricing-rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rules: updates })
        });
        if (!res.ok) {
          res = await fetch('/api/pricing-rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rules: updates })
          });
        }
        const result = await res.json();
        showToast(result.message || "产值定价规则已更新并全局重算！", "success");
        modifiedRules.value = {};
        await fetchPricingRules();
        await fetchOverview();
        await fetchRankings();
        await fetchDailyRanking(selectedDailyDate.value);
      } catch (err) {
        console.error("Save pricing error:", err);
        showToast("保存定价失败，请重试", "error");
      } finally {
        loading.value = false;
      }
    }

    // ==========================================
    // 7. Transport Records State & Methods
    // ==========================================
    const recordsData = ref({ total: 0, page: 1, page_size: 50, total_pages: 1, summary: {}, records: [] });
    const recordFilters = ref({
      page: 1,
      page_size: 50,
      driver: '',
      vehicle: '',
      site: '',
      material: '',
      start_date: '',
      end_date: '',
      keyword: ''
    });

    const driverOptions = computed(() => {
      const set = new Set();
      (overviewData.value.driver_chart_data || []).forEach(d => set.add(d.driver));
      return Array.from(set).sort();
    });

    const vehicleOptions = computed(() => {
      const set = new Set();
      (overviewData.value.vehicle_stats || []).forEach(v => set.add(v.vehicle));
      return Array.from(set).sort();
    });

    const siteOptions = computed(() => {
      const set = new Set();
      (pricingRules.value || []).forEach(p => set.add(p.site));
      return Array.from(set).sort();
    });

    async function fetchRecords() {
      loading.value = true;
      try {
        const params = new URLSearchParams();
        params.append('page', recordFilters.value.page);
        params.append('page_size', recordFilters.value.page_size);
        if (recordFilters.value.driver) params.append('driver', recordFilters.value.driver);
        if (recordFilters.value.vehicle) params.append('vehicle', recordFilters.value.vehicle);
        if (recordFilters.value.site) params.append('site', recordFilters.value.site);
        if (recordFilters.value.material) params.append('material', recordFilters.value.material);
        if (recordFilters.value.start_date) params.append('start_date', recordFilters.value.start_date);
        if (recordFilters.value.end_date) params.append('end_date', recordFilters.value.end_date);
        if (recordFilters.value.keyword) params.append('keyword', recordFilters.value.keyword);

        let res = await fetch(`/api/fleet/records?${params.toString()}`);
        if (!res.ok) res = await fetch(`/api/records?${params.toString()}`);
        const data = await res.json();
        recordsData.value = data;
      } catch (err) {
        console.error("Fetch records error:", err);
        showToast("加载明细数据失败", "error");
      } finally {
        loading.value = false;
      }
    }

    function resetRecordFilters() {
      recordFilters.value = {
        page: 1,
        page_size: 50,
        driver: '',
        vehicle: '',
        site: '',
        material: '',
        start_date: '',
        end_date: '',
        keyword: ''
      };
      fetchRecords();
    }

    function changePage(p) {
      if (p >= 1 && p <= recordsData.value.total_pages) {
        recordFilters.value.page = p;
        fetchRecords();
      }
    }

    const recordModal = ref({
      show: false,
      isEdit: false,
      form: {
        明细ID: null,
        日期: new Date().toISOString().slice(0, 10),
        车牌号: '',
        司机: '',
        土点名称: '',
        物料: '全部',
        数量: 1,
        绩效单价: 250,
        绩效得分: 250,
        原始明细: ''
      }
    });

    function openAddRecordModal() {
      recordModal.value = {
        show: true,
        isEdit: false,
        form: {
          明细ID: null,
          日期: new Date().toISOString().slice(0, 10),
          车牌号: vehicleOptions.value[0] || '京A16185D',
          司机: driverOptions.value[0] || '黄林刚',
          土点名称: '京首建',
          物料: '级配',
          数量: 1,
          绩效单价: 250,
          绩效得分: 250,
          原始明细: ''
        }
      };
      autoMatchUnitPrice();
    }

    function openEditRecordModal(rec) {
      recordModal.value = {
        show: true,
        isEdit: true,
        form: { ...rec }
      };
    }

    function autoMatchUnitPrice() {
      const site = recordModal.value.form.土点名称;
      const mat = recordModal.value.form.物料;
      const match = pricingRules.value.find(r => r.site === site && (r.material === mat || r.material === '全部'));
      if (match) {
        recordModal.value.form.绩效单价 = match.price;
      } else {
        recordModal.value.form.绩效单价 = 250;
      }
      recordModal.value.form.绩效得分 = (recordModal.value.form.数量 * recordModal.value.form.绩效单价);
    }

    async function submitRecordForm() {
      const form = recordModal.value.form;
      if (!form.车牌号 || !form.司机 || !form.土点名称) {
        showToast("请完整填写车牌号、司机和土点名称", "error");
        return;
      }
      loading.value = true;
      try {
        let res;
        const apiPrefix = '/api/fleet/records';
        if (recordModal.value.isEdit) {
          res = await fetch(`${apiPrefix}/${form.明细ID}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form)
          });
          if (!res.ok) {
            res = await fetch(`/api/records/${form.明细ID}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(form)
            });
          }
        } else {
          res = await fetch(apiPrefix, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form)
          });
          if (!res.ok) {
            res = await fetch('/api/records', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(form)
            });
          }
        }
        const result = await res.json();
        showToast(result.message || "出车明细保存成功！", "success");
        recordModal.value.show = false;
        await fetchRecords();
        await fetchOverview();
        await fetchRankings();
        await fetchDailyRanking(selectedDailyDate.value);
      } catch (err) {
        console.error("Submit record error:", err);
        showToast("保存失败，请重试", "error");
      } finally {
        loading.value = false;
      }
    }

    async function deleteRecordItem(id) {
      if (!confirm(`确定要删除明细 #${id} 吗？`)) return;
      loading.value = true;
      try {
        let res = await fetch(`/api/fleet/records/${id}`, { method: 'DELETE' });
        if (!res.ok) res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
        const result = await res.json();
        showToast(result.message || "明细已删除！", "success");
        await fetchRecords();
        await fetchOverview();
        await fetchRankings();
        await fetchDailyRanking(selectedDailyDate.value);
      } catch (err) {
        console.error("Delete record error:", err);
        showToast("删除失败", "error");
      } finally {
        loading.value = false;
      }
    }

    // ==========================================
    // 8. Vehicles State & Methods
    // ==========================================
    const vehiclesData = ref({ vehicles: [], rules: {} });
    const vehicleExceptionSearch = ref('');

    const filteredVehicleExceptions = computed(() => {
      const list = vehiclesData.value.rules?.exceptions || [];
      const q = vehicleExceptionSearch.value.trim().toLowerCase();
      if (!q) return list;
      return list.filter(item => 
        (item.date && String(item.date).toLowerCase().includes(q)) ||
        (item.vehicle && String(item.vehicle).toLowerCase().includes(q)) ||
        (item.driver && String(item.driver).toLowerCase().includes(q)) ||
        (item.note && String(item.note).toLowerCase().includes(q))
      );
    });

    async function fetchVehicles() {
      try {
        let res = await fetch('/api/fleet/vehicles');
        if (!res.ok) res = await fetch('/api/vehicles');
        const data = await res.json();
        vehiclesData.value = data;
      } catch (err) {
        console.error("Fetch vehicles error:", err);
      }
    }

    // ==========================================
    // 9. Global Reset & Export
    // ==========================================
    async function resetToBaseline() {
      if (!confirm("确定要将所有数据重置为原始 Excel 基准数据吗？已修改的价格和新增记录将被还原。")) return;
      loading.value = true;
      try {
        let res = await fetch('/api/fleet/reset', { method: 'POST' });
        if (!res.ok) res = await fetch('/api/reset', { method: 'POST' });
        const result = await res.json();
        showToast(result.message, "success");
        await fetchOverview();
        await fetchRankings();
        await fetchPricingRules();
        await fetchRecords();
        await fetchVehicles();
        await fetchDailyRanking();
      } catch (err) {
        console.error("Reset error:", err);
        showToast("重置失败", "error");
      } finally {
        loading.value = false;
      }
    }

    function exportToExcel() {
      window.location.href = '/api/fleet/export';
      showToast("正在导出最新 Excel 报表...", "info");
    }

    function setPeriod(p) {
      currentPeriod.value = p;
      fetchOverview();
      fetchRankings();
    }

    // ==========================================
    // 10. Watchers for Tab & Period Changes
    // ==========================================
    watch(currentTab, async (newTab) => {
      await nextTick();
      if (newTab === 'overview') {
        renderOverviewCharts();
      } else if (newTab === 'daily') {
        if (!dailyRankingData.value.date) {
          await fetchDailyRanking();
        } else {
          renderDailyChart();
        }
      } else if (newTab === 'rankings') {
        fetchRankings();
      } else if (newTab === 'pricing') {
        fetchPricingRules();
      } else if (newTab === 'records') {
        fetchRecords();
      } else if (newTab === 'vehicles') {
        fetchVehicles();
      }
    // Watch tab change to resize charts and refresh lucide icons
    watch(currentTab, (newTab) => {
      nextTick(() => {
        if (newTab === 'overview') {
          renderOverviewCharts();
        } else if (newTab === 'daily') {
          renderDailyChart();
        }
        ChartEngine.resizeAll();
        if (window.lucide) window.lucide.createIcons();
      });
    });

    // ==========================================
    // 11. Lifecycle onMounted Initialization
    // ==========================================
    onMounted(async () => {
      // 1. Detect Parent Theme
      let initTheme = 'light';
      try {
        if (window.parent && window.parent !== window && window.parent.document) {
          const parentDocEl = window.parent.document.documentElement;
          const parentTheme = parentDocEl.getAttribute('data-theme');
          if (parentTheme) initTheme = parentTheme;

          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (mutation.attributeName === 'data-theme') {
                const newTheme = parentDocEl.getAttribute('data-theme') || 'light';
                applyTheme(newTheme);
              }
            });
          });
          observer.observe(parentDocEl, { attributes: true, attributeFilter: ['data-theme'] });
        }
      } catch (e) {}

      try {
        const stored = sessionStorage.getItem('theme') || localStorage.getItem('theme');
        if (stored && (!window.parent || window.parent === window)) {
          initTheme = stored;
        }
      } catch (e) {}

      applyTheme(initTheme);

      // 2. Listen for postMessage from parent
      window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'THEME_CHANGE') {
          applyTheme(event.data.theme);
        }
      });

      // 3. Fetch initial data with safe fallbacks
      try { await fetchOverview(); } catch (e) {}
      try { await fetchRankings(); } catch (e) {}
      try { await fetchPricingRules(); } catch (e) {}
      try { await fetchRecords(); } catch (e) {}
      try { await fetchVehicles(); } catch (e) {}
      try { await fetchDailyRanking(); } catch (e) {}
    });

    return {
      currentTab,
      currentPeriod,
      customStartDate,
      customEndDate,
      setPeriod,
      loading,
      toast,
      showToast,

      // Theme
      currentTheme,

      // Daily Ranking
      dailyRankingData,
      selectedDailyDate,
      dailyRatingFilter,
      dailyDriverSearch,
      filteredDailyRankings,
      fetchDailyRanking,
      prevDailyDate,
      nextDailyDate,

      // Dashboard
      overviewData,

      // Rankings
      rankingsData,
      driverSearch,
      driverRatingFilter,
      filteredRankings,
      activeDriverModal,
      driverProfile,
      driverProfileLoading,
      openDriverProfile,

      // Pricing Rules
      pricingRules,
      pricingSearch,
      pricingTotalRevenue,
      pricingInitialTotal,
      modifiedRules,
      filteredPricingRules,
      onPriceInputChange,
      savePricingRules,

      // Records
      recordsData,
      recordFilters,
      driverOptions,
      vehicleOptions,
      siteOptions,
      fetchRecords,
      resetRecordFilters,
      changePage,
      recordModal,
      openAddRecordModal,
      openEditRecordModal,
      autoMatchUnitPrice,
      submitRecordForm,
      deleteRecordItem,

      // Vehicles
      vehiclesData,
      vehicleExceptionSearch,
      filteredVehicleExceptions,

      // Export & Reset
      exportToExcel,
      resetToBaseline
    };
  }
});

app.mount('#app');
