from fastapi import APIRouter, HTTPException, Query, Body, Response
from typing import List, Optional, Dict, Any
import os
import json
import datetime

router = APIRouter(prefix="/api/fleet", tags=["FleetMaster"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FLEET_DIR = os.path.join(BASE_DIR, 'fleet')
DATA_DIR = os.path.join(FLEET_DIR, 'data')
INITIAL_DATA_FILE = os.path.join(DATA_DIR, 'fleet_data.json')
CURRENT_DATA_FILE = os.path.join(DATA_DIR, 'fleet_data_current.json')

DB: Dict[str, Any] = {}

def load_data():
    global DB
    data_file = CURRENT_DATA_FILE if os.path.exists(CURRENT_DATA_FILE) else INITIAL_DATA_FILE
    if not os.path.exists(data_file):
        raise FileNotFoundError(f"Database file not found: {data_file}")
    with open(data_file, 'r', encoding='utf-8') as f:
        DB = json.load(f)
    print(f"[FleetMaster] Loaded {len(DB.get('transport_records', []))} records into memory.")

def save_current_data():
    with open(CURRENT_DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(DB, f, ensure_ascii=False, indent=2)

def recalculate_all():
    records = DB.get('transport_records', [])
    pricing_rules = DB.get('pricing_rules', [])
    
    price_map = {}
    for r in pricing_rules:
        k = r.get('key')
        p = float(r.get('price', 0))
        if k:
            price_map[k] = p
            
    site_price_map = {}
    for r in pricing_rules:
        s = r.get('site')
        p = float(r.get('price', 0))
        if s and s not in site_price_map:
            site_price_map[s] = p

    rule_stats = {r.get('key'): {'trips': 0.0, 'amount': 0.0} for r in pricing_rules}
    
    for rec in records:
        key = rec.get('计价键')
        site = rec.get('土点名称')
        qty = float(rec.get('数量', 0) or 0)
        
        unit_price = 250.0
        if key in price_map:
            unit_price = price_map[key]
        elif site in site_price_map:
            unit_price = site_price_map[site]
            
        rec['绩效单价'] = unit_price
        rec['绩效得分'] = round(qty * unit_price, 2)
        
        if key in rule_stats:
            rule_stats[key]['trips'] += qty
            rule_stats[key]['amount'] += rec['绩效得分']
            
    for r in pricing_rules:
        k = r.get('key')
        if k in rule_stats:
            r['confirmed_trips'] = round(rule_stats[k]['trips'], 1)
            r['current_performance'] = round(rule_stats[k]['amount'], 2)

    daily_driver_trips = {}
    dates_set = set()
    
    for rec in records:
        d = rec.get('日期')
        drv = rec.get('司机')
        veh = rec.get('车牌号')
        qty = float(rec.get('数量', 0) or 0)
        amt = float(rec.get('绩效得分', 0) or 0)
        if not d or not drv:
            continue
        dates_set.add(d)
        dk = (d, drv)
        if dk not in daily_driver_trips:
            daily_driver_trips[dk] = {'date': d, 'driver': drv, 'vehicle': veh, 'trips': 0.0, 'daily_amount': 0.0}
        daily_driver_trips[dk]['trips'] += qty
        daily_driver_trips[dk]['daily_amount'] += amt
        
    daily_groups = {}
    for (d, drv), item in daily_driver_trips.items():
        if d not in daily_groups:
            daily_groups[d] = []
        daily_groups[d].append(item)
        
    daily_perf_list = []
    for d in sorted(dates_set):
        drivers_on_day = daily_groups.get(d, [])
        active_cnt = len(drivers_on_day)
        tot_trips = sum(x['trips'] for x in drivers_on_day)
        tot_amt = sum(x['daily_amount'] for x in drivers_on_day)
        avg_trips = tot_trips / active_cnt if active_cnt > 0 else 0
        avg_amt = tot_amt / active_cnt if active_cnt > 0 else 0
        
        for item in drivers_on_day:
            rel_trips_idx = (item['trips'] / avg_trips) if avg_trips > 0 else 1.0
            rel_amt_idx = (item['daily_amount'] / avg_amt) if avg_amt > 0 else 1.0
            fair_idx = rel_amt_idx
            
            if fair_idx >= 1.05:
                rating = "较高"
            elif fair_idx < 0.95:
                rating = "偏低"
            else:
                rating = "中等"
                
            daily_perf_list.append({
                "date": d,
                "driver": item['driver'],
                "vehicle": item['vehicle'],
                "trips": round(item['trips'], 1),
                "daily_amount": round(item['daily_amount'], 2),
                "unpriced_trips": 0.0,
                "active_drivers_count": active_cnt,
                "daily_avg_trips": round(avg_trips, 2),
                "rel_trips_index": round(rel_trips_idx, 4),
                "fully_priced": "是",
                "fully_priced_drivers_count": active_cnt,
                "daily_avg_amount": round(avg_amt, 2),
                "rel_amount_index": round(rel_amt_idx, 4),
                "fair_perf_index": round(fair_idx, 4),
                "eval_basis": "产值",
                "rating": rating
            })
            
    DB['daily_performance'] = daily_perf_list

    def compute_ranking(perf_sub):
        driver_map = {}
        for row in perf_sub:
            drv = row['driver']
            if drv not in driver_map:
                driver_map[drv] = {
                    'driver': drv,
                    'days': 0,
                    'confirmed_trips': 0.0,
                    'total_amount': 0.0,
                    'rel_trips_indices': [],
                    'rel_amt_indices': [],
                    'higher_days': 0,
                    'medium_days': 0,
                    'lower_days': 0
                }
            driver_map[drv]['days'] += 1
            driver_map[drv]['confirmed_trips'] += row['trips']
            driver_map[drv]['total_amount'] += row['daily_amount']
            driver_map[drv]['rel_trips_indices'].append(row['rel_trips_index'])
            driver_map[drv]['rel_amt_indices'].append(row['rel_amount_index'])
            if row['rating'] == '较高':
                driver_map[drv]['higher_days'] += 1
            elif row['rating'] == '偏低':
                driver_map[drv]['lower_days'] += 1
            else:
                driver_map[drv]['medium_days'] += 1

        res = []
        for drv, d_data in driver_map.items():
            days = d_data['days']
            trips = d_data['confirmed_trips']
            amt = d_data['total_amount']
            daily_avg_trips = trips / days if days > 0 else 0
            daily_avg_amt = amt / days if days > 0 else 0
            avg_trips_idx = sum(d_data['rel_trips_indices']) / days if days > 0 else 1.0
            avg_amt_idx = sum(d_data['rel_amt_indices']) / days if days > 0 else 1.0
            fair_perf_idx = avg_amt_idx
            
            if fair_perf_idx >= 1.05:
                overall_eval = "较高"
            elif fair_perf_idx < 0.95:
                overall_eval = "偏低"
            else:
                overall_eval = "中等"
                
            sample_status = "正式" if days >= 5 else "样本较少"
            
            res.append({
                "driver": drv,
                "days": days,
                "confirmed_trips": round(trips, 1),
                "daily_avg_trips": round(daily_avg_trips, 1),
                "total_amount": round(amt, 2),
                "daily_avg_amount": round(daily_avg_amt, 2),
                "avg_trips_index": round(avg_trips_idx, 4),
                "avg_amount_index": round(avg_amt_idx, 4),
                "fair_perf_index": round(fair_perf_idx, 4),
                "eval_basis": "产值",
                "higher_days": d_data['higher_days'],
                "medium_days": d_data['medium_days'],
                "lower_days": d_data['lower_days'],
                "overall_eval": overall_eval,
                "sample_status": sample_status
            })
            
        res.sort(key=lambda x: (x['sample_status'] == '正式', x['fair_perf_index']), reverse=True)
        for idx, item in enumerate(res, 1):
            item['rank'] = idx
        return res

    DB['fair_rankings_all'] = compute_ranking(daily_perf_list)
    july_perf = [x for x in daily_perf_list if x['date'].startswith('2026-07')]
    DB['fair_rankings_july'] = compute_ranking(july_perf)
    aug_perf = [x for x in daily_perf_list if x['date'].startswith('2026-08')]
    DB['fair_rankings_aug'] = compute_ranking(aug_perf)
    
    DB['metadata']['recalculated_at'] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    save_current_data()

load_data()

@router.get("/status")
def get_status():
    return {
        "status": "ok",
        "records_count": len(DB.get('transport_records', [])),
        "pricing_rules_count": len(DB.get('pricing_rules', [])),
        "metadata": DB.get('metadata', {})
    }

@router.get("/overview")
def get_overview(
    period: str = Query("all", description="all | july | aug | custom"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    records = DB.get('transport_records', [])
    daily_perf = DB.get('daily_performance', [])
    
    if period == 'july':
        records = [r for r in records if r.get('日期', '').startswith('2026-07')]
        daily_perf = [r for r in daily_perf if r.get('date', '').startswith('2026-07')]
    elif period == 'aug':
        records = [r for r in records if r.get('日期', '').startswith('2026-08')]
        daily_perf = [r for r in daily_perf if r.get('date', '').startswith('2026-08')]
    elif period == 'custom' and (start_date or end_date):
        if start_date:
            records = [r for r in records if r.get('日期', '') >= start_date]
            daily_perf = [r for r in daily_perf if r.get('date', '') >= start_date]
        if end_date:
            records = [r for r in records if r.get('日期', '') <= end_date]
            daily_perf = [r for r in daily_perf if r.get('date', '') <= end_date]

    total_trips = sum(float(r.get('数量', 0) or 0) for r in records)
    total_revenue = sum(float(r.get('绩效得分', 0) or 0) for r in records)
    total_man_days = len(daily_perf)
    active_drivers = len(set(r.get('司机') for r in records if r.get('司机')))
    active_vehicles = len(set(r.get('车牌号') for r in records if r.get('车牌号')))
    unique_dates = len(set(r.get('日期') for r in records if r.get('日期')))
    
    daily_avg_trips = total_trips / unique_dates if unique_dates > 0 else 0
    daily_avg_revenue = total_revenue / unique_dates if unique_dates > 0 else 0
    avg_price_per_trip = total_revenue / total_trips if total_trips > 0 else 0
    avg_revenue_per_driver = total_revenue / active_drivers if active_drivers > 0 else 0

    date_map = {}
    for r in records:
        d = r.get('日期')
        if not d: continue
        if d not in date_map:
            date_map[d] = {'date': d, 'trips': 0.0, 'revenue': 0.0, 'drivers': set(), 'vehicles': set()}
        date_map[d]['trips'] += float(r.get('数量', 0) or 0)
        date_map[d]['revenue'] += float(r.get('绩效得分', 0) or 0)
        date_map[d]['drivers'].add(r.get('司机'))
        date_map[d]['vehicles'].add(r.get('车牌号'))
        
    trend_series = []
    for d in sorted(date_map.keys()):
        trend_series.append({
            "date": d,
            "trips": round(date_map[d]['trips'], 1),
            "revenue": round(date_map[d]['revenue'], 2),
            "drivers_count": len(date_map[d]['drivers']),
            "vehicles_count": len(date_map[d]['vehicles'])
        })

    site_map = {}
    for r in records:
        site = r.get('土点名称') or '未知土点'
        if site not in site_map:
            site_map[site] = {'name': site, 'trips': 0.0, 'revenue': 0.0, 'count': 0}
        site_map[site]['trips'] += float(r.get('数量', 0) or 0)
        site_map[site]['revenue'] += float(r.get('绩效得分', 0) or 0)
        site_map[site]['count'] += 1
        
    site_ranking = sorted(site_map.values(), key=lambda x: x['revenue'], reverse=True)

    veh_map = {}
    for r in records:
        veh = r.get('车牌号') or '未知车辆'
        if veh not in veh_map:
            veh_map[veh] = {'vehicle': veh, 'trips': 0.0, 'revenue': 0.0, 'days': set()}
        veh_map[veh]['trips'] += float(r.get('数量', 0) or 0)
        veh_map[veh]['revenue'] += float(r.get('绩效得分', 0) or 0)
        veh_map[veh]['days'].add(r.get('日期'))
        
    vehicle_stats = []
    for v, item in veh_map.items():
        vehicle_stats.append({
            "vehicle": v,
            "trips": round(item['trips'], 1),
            "revenue": round(item['revenue'], 2),
            "days_active": len(item['days']),
            "daily_trips": round(item['trips'] / len(item['days']), 1) if item['days'] else 0
        })
    vehicle_stats.sort(key=lambda x: x['revenue'], reverse=True)

    driver_map = {}
    for r in records:
        drv = r.get('司机') or '未知'
        if drv not in driver_map:
            driver_map[drv] = {'driver': drv, 'trips': 0.0, 'revenue': 0.0, 'days': set()}
        driver_map[drv]['trips'] += float(r.get('数量', 0) or 0)
        driver_map[drv]['revenue'] += float(r.get('绩效得分', 0) or 0)
        driver_map[drv]['days'].add(r.get('日期'))
        
    driver_stats = []
    for drv, item in driver_map.items():
        driver_stats.append({
            "driver": drv,
            "trips": round(item['trips'], 1),
            "revenue": round(item['revenue'], 2),
            "days": len(item['days']),
            "daily_revenue": round(item['revenue'] / len(item['days']), 2) if item['days'] else 0
        })
    driver_stats.sort(key=lambda x: x['revenue'], reverse=True)

    return {
        "period": period,
        "kpis": {
            "total_trips": round(total_trips, 1),
            "total_revenue": round(total_revenue, 2),
            "total_man_days": total_man_days,
            "active_drivers": active_drivers,
            "active_vehicles": active_vehicles,
            "unique_dates": unique_dates,
            "daily_avg_trips": round(daily_avg_trips, 1),
            "daily_avg_revenue": round(daily_avg_revenue, 2),
            "avg_price_per_trip": round(avg_price_per_trip, 2),
            "avg_revenue_per_driver": round(avg_revenue_per_driver, 2)
        },
        "trends": trend_series,
        "site_ranking": site_ranking,
        "vehicle_stats": vehicle_stats,
        "driver_chart_data": driver_stats
    }

@router.get("/daily-ranking")
def get_daily_ranking(date: Optional[str] = None, benchmark_price: float = 250.0):
    records = DB.get("transport_records", [])
    if not records:
        return {"error": "暂无数据"}
    
    all_dates = sorted(list(set(r["日期"] for r in records if r.get("日期"))), reverse=True)
    if not all_dates:
        return {"error": "未找到有效出车日期"}
    
    target_date = date if (date and date in all_dates) else all_dates[0]
    day_records = [r for r in records if r.get("日期") == target_date]
    if not day_records:
        return {
            "date": target_date,
            "benchmark_price": benchmark_price,
            "available_dates": all_dates,
            "daily_summary": {},
            "rankings": []
        }
    
    driver_map = {}
    for r in day_records:
        drv = r.get("司机", "未知")
        if drv not in driver_map:
            driver_map[drv] = {
                "driver": drv,
                "vehicles": set(),
                "trips_actual": 0.0,
                "total_amount": 0.0,
                "details": []
            }
        vh = r.get("车牌号", "")
        if vh:
            driver_map[drv]["vehicles"].add(vh)
        
        trips = float(r.get("数量", 0) or 0)
        price = float(r.get("绩效单价", 0) or 0)
        amount = float(r.get("绩效得分", 0) or (trips * price))
        site = r.get("土点名称", "未知")
        mat = r.get("物料", "全部")
        
        driver_map[drv]["trips_actual"] += trips
        driver_map[drv]["total_amount"] += amount
        driver_map[drv]["details"].append({
            "site": site,
            "material": mat,
            "trips": trips,
            "price": price,
            "amount": amount
        })
    
    total_drivers = len(driver_map)
    total_day_amount = sum(d["total_amount"] for d in driver_map.values())
    total_day_actual_trips = sum(d["trips_actual"] for d in driver_map.values())
    avg_day_amount = total_day_amount / total_drivers if total_drivers > 0 else 0
    avg_day_standard_trips = (avg_day_amount / benchmark_price) if benchmark_price > 0 else 0
    
    ranking_list = []
    for drv, d in driver_map.items():
        std_trips = round(d["total_amount"] / benchmark_price, 2) if benchmark_price > 0 else 0
        
        site_summary = {}
        for item in d["details"]:
            key = f"{item['site']}"
            if item['material'] and item['material'] not in ['全部', '普土', '']:
                key += f"({item['material']})"
            if key not in site_summary:
                site_summary[key] = {"site_label": key, "trips": 0, "price": item["price"], "amount": 0}
            site_summary[key]["trips"] += item["trips"]
            site_summary[key]["amount"] += item["amount"]
        
        details_formatted = list(site_summary.values())
        vs_avg_ratio = (d["total_amount"] / avg_day_amount) if avg_day_amount > 0 else 1.0
        vs_avg_percent = round((vs_avg_ratio - 1.0) * 100, 1)
        
        if vs_avg_ratio >= 1.05:
            tier = "较高"
        elif vs_avg_ratio < 0.95:
            tier = "偏低"
        else:
            tier = "均值"
            
        ranking_list.append({
            "driver": drv,
            "vehicles": list(d["vehicles"]),
            "vehicle_display": ", ".join(d["vehicles"]) if d["vehicles"] else "主车",
            "trips_actual": round(d["trips_actual"], 1),
            "standard_trips": std_trips,
            "total_amount": round(d["total_amount"], 2),
            "vs_avg_percent": vs_avg_percent,
            "tier": tier,
            "details": details_formatted
        })
    
    ranking_list.sort(key=lambda x: x["total_amount"], reverse=True)
    for i, item in enumerate(ranking_list):
        if i > 0 and item["total_amount"] == ranking_list[i-1]["total_amount"]:
            item["rank"] = ranking_list[i-1]["rank"]
        else:
            item["rank"] = i + 1
            
    top_driver = ranking_list[0]["driver"] if ranking_list else "无"
    max_standard = ranking_list[0]["standard_trips"] if ranking_list else 0
    min_standard = ranking_list[-1]["standard_trips"] if ranking_list else 0
    
    return {
        "date": target_date,
        "benchmark_price": benchmark_price,
        "available_dates": all_dates,
        "daily_summary": {
            "active_drivers": total_drivers,
            "total_actual_trips": round(total_day_actual_trips, 1),
            "total_standard_trips": round(total_day_amount / benchmark_price, 1) if benchmark_price > 0 else 0,
            "total_amount": round(total_day_amount, 2),
            "avg_standard_trips": round(avg_day_standard_trips, 2),
            "avg_amount": round(avg_day_amount, 2),
            "top_driver": top_driver,
            "max_standard_trips": max_standard,
            "min_standard_trips": min_standard
        },
        "rankings": ranking_list
    }

@router.get("/rankings")
def get_rankings(period: str = Query("all", description="all | july | aug")):
    if period == 'july':
        return {"period": "2026年7月", "rankings": DB.get('fair_rankings_july', [])}
    elif period == 'aug':
        return {"period": "2026年8月", "rankings": DB.get('fair_rankings_aug', [])}
    else:
        return {"period": "7-8月全期", "rankings": DB.get('fair_rankings_all', [])}

@router.get("/driver/{driver_name}")
def get_driver_profile(driver_name: str):
    records = DB.get('transport_records', [])
    daily_perf = DB.get('daily_performance', [])
    
    drv_records = [r for r in records if r.get('司机') == driver_name]
    if not drv_records:
        raise HTTPException(status_code=404, detail=f"司机 {driver_name} 未找到出车记录")
        
    drv_daily = [r for r in daily_perf if r.get('driver') == driver_name]
    drv_daily.sort(key=lambda x: x.get('date'))
    
    tot_trips = sum(float(r.get('数量', 0) or 0) for r in drv_records)
    tot_amt = sum(float(r.get('绩效得分', 0) or 0) for r in drv_records)
    active_days = len(drv_daily)
    
    site_breakdown = {}
    for r in drv_records:
        s = r.get('土点名称') or '未知'
        if s not in site_breakdown:
            site_breakdown[s] = {'site': s, 'trips': 0.0, 'revenue': 0.0}
        site_breakdown[s]['trips'] += float(r.get('数量', 0) or 0)
        site_breakdown[s]['revenue'] += float(r.get('绩效得分', 0) or 0)
        
    veh_breakdown = {}
    for r in drv_records:
        v = r.get('车牌号') or '未知'
        if v not in veh_breakdown:
            veh_breakdown[v] = {'vehicle': v, 'trips': 0.0, 'revenue': 0.0, 'dates': set()}
        veh_breakdown[v]['trips'] += float(r.get('数量', 0) or 0)
        veh_breakdown[v]['revenue'] += float(r.get('绩效得分', 0) or 0)
        veh_breakdown[v]['dates'].add(r.get('日期'))
        
    vehicle_history = []
    for v, item in veh_breakdown.items():
        vehicle_history.append({
            "vehicle": v,
            "trips": round(item['trips'], 1),
            "revenue": round(item['revenue'], 2)
        })
        
    all_rankings = DB.get('fair_rankings_all', [])
    driver_stat = next((d for d in all_rankings if d['driver'] == driver_name), None)

    return {
        "driver": driver_name,
        "kpis": {
            "total_trips": round(tot_trips, 1),
            "total_revenue": round(tot_amt, 2),
            "active_days": active_days,
            "daily_avg_trips": round(tot_trips / active_days, 1) if active_days else 0,
            "daily_avg_revenue": round(tot_amt / active_days, 2) if active_days else 0,
            "fair_perf_index": driver_stat['fair_perf_index'] if driver_stat else 1.0,
            "overall_eval": driver_stat['overall_eval'] if driver_stat else "中等",
            "higher_days": driver_stat['higher_days'] if driver_stat else 0,
            "medium_days": driver_stat['medium_days'] if driver_stat else 0,
            "lower_days": driver_stat['lower_days'] if driver_stat else 0
        },
        "daily_timeline": drv_daily,
        "site_breakdown": sorted(site_breakdown.values(), key=lambda x: x['revenue'], reverse=True),
        "vehicle_history": vehicle_history
    }

@router.get("/pricing-rules")
def get_pricing_rules():
    rules = DB.get('pricing_rules', [])
    tot = sum(r.get('current_performance', 0) for r in rules)
    return {
        "total_revenue": round(tot, 2),
        "pricing_rules": rules
    }

@router.post("/pricing-rules")
def update_pricing_rules(payload: Dict[str, Any] = Body(...)):
    updates = payload.get('rules', [])
    rules = DB.get('pricing_rules', [])
    rule_dict = {r['key']: r for r in rules}
    
    for item in updates:
        k = item.get('key')
        p = item.get('price')
        if k in rule_dict and p is not None:
            rule_dict[k]['price'] = float(p)
            
    recalculate_all()
    return {"success": True, "message": "产值规则更新并全量重算完成！"}

@router.get("/records")
def get_records(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    driver: Optional[str] = None,
    vehicle: Optional[str] = None,
    site: Optional[str] = None,
    material: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    keyword: Optional[str] = None
):
    records = DB.get('transport_records', [])
    filtered = records
    
    if driver:
        filtered = [r for r in filtered if r.get('司机') == driver]
    if vehicle:
        filtered = [r for r in filtered if r.get('车牌号') == vehicle]
    if site:
        filtered = [r for r in filtered if r.get('土点名称') == site]
    if material:
        filtered = [r for r in filtered if r.get('物料') == material]
    if start_date:
        filtered = [r for r in filtered if r.get('日期', '') >= start_date]
    if end_date:
        filtered = [r for r in filtered if r.get('日期', '') <= end_date]
    if keyword:
        kw = keyword.lower()
        filtered = [r for r in filtered if kw in (r.get('原始明细') or '').lower() or kw in (r.get('解析片段') or '').lower()]
        
    tot = len(filtered)
    tot_trips = sum(float(r.get('数量', 0) or 0) for r in filtered)
    tot_amt = sum(float(r.get('绩效得分', 0) or 0) for r in filtered)
    
    total_pages = (tot + page_size - 1) // page_size if tot > 0 else 1
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    page_records = filtered[start_idx:end_idx]
    
    return {
        "total": tot,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "summary": {
            "total_trips": round(tot_trips, 1),
            "total_revenue": round(tot_amt, 2)
        },
        "records": page_records
    }

@router.post("/records")
def add_record(payload: Dict[str, Any] = Body(...)):
    records = DB.get('transport_records', [])
    new_id = max((r.get('明细ID', 0) for r in records), default=0) + 1
    
    qty = float(payload.get('数量', 1))
    p = float(payload.get('绩效单价', 250))
    amt = round(qty * p, 2)
    site = payload.get('土点名称', '未知')
    mat = payload.get('物料', '全部')
    key = f"{site}|{mat}"
    
    new_rec = {
        "明细ID": new_id,
        "日期": payload.get('日期', datetime.date.today().isoformat()),
        "原表位置": "在线补录",
        "车牌号": payload.get('车牌号', ''),
        "司机": payload.get('司机', ''),
        "土点名称": site,
        "原土点写法": site,
        "物料": mat,
        "数量": qty,
        "单位": "车",
        "计入绩效": "是",
        "绩效单价": p,
        "绩效得分": amt,
        "识别状态": "在线录入",
        "司机匹配依据": "手动录入",
        "复核说明": "线上运维录入",
        "解析片段": f"{site}{qty}车",
        "原始明细": f"线上录入 {site} {qty}车",
        "来源ID": 9999,
        "计价键": key
    }
    
    records.insert(0, new_rec)
    recalculate_all()
    return {"success": True, "message": f"出车记录 #{new_id} 录入成功！", "record_id": new_id}

@router.put("/records/{record_id}")
def update_record(record_id: int, payload: Dict[str, Any] = Body(...)):
    records = DB.get('transport_records', [])
    rec = next((r for r in records if r.get('明细ID') == record_id), None)
    if not rec:
        raise HTTPException(status_code=404, detail="未找到明细记录")
        
    for k in ['日期', '车牌号', '司机', '土点名称', '物料', '数量', '绩效单价']:
        if k in payload:
            rec[k] = payload[k]
            
    qty = float(rec.get('数量', 0) or 0)
    p = float(rec.get('绩效单价', 0) or 0)
    rec['绩效得分'] = round(qty * p, 2)
    rec['计价键'] = f"{rec.get('土点名称')}|{rec.get('物料')}"
    
    recalculate_all()
    return {"success": True, "message": f"出车记录 #{record_id} 修改成功！"}

@router.delete("/records/{record_id}")
def delete_record(record_id: int):
    records = DB.get('transport_records', [])
    idx = next((i for i, r in enumerate(records) if r.get('明细ID') == record_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="未找到明细记录")
    records.pop(idx)
    recalculate_all()
    return {"success": True, "message": f"出车记录 #{record_id} 删除成功！"}

@router.get("/vehicles")
def get_vehicles():
    v_rules = DB.get('vehicle_driver_rules', {})
    default_drivers = v_rules.get('default_drivers', [])
    records = DB.get('transport_records', [])
    
    # 建立车辆默认司机映射
    default_map = {item['vehicle']: item.get('default_driver', '待指定') for item in default_drivers}
    
    # 动态统计每辆车累计出车、累计产值、出勤天数与参与驾驶司机
    veh_map = {}
    for r in records:
        v = r.get('车牌号')
        if not v:
            continue
        if v not in veh_map:
            veh_map[v] = {
                'vehicle': v,
                'default_driver': default_map.get(v, '待指定'),
                'total_trips': 0.0,
                'total_revenue': 0.0,
                'active_dates': set(),
                'drivers': set()
            }
        qty = float(r.get('数量', 0) or 0)
        amt = float(r.get('绩效得分', 0) or 0)
        d = r.get('日期')
        drv = r.get('司机')
        
        veh_map[v]['total_trips'] += qty
        veh_map[v]['total_revenue'] += amt
        if d:
            veh_map[v]['active_dates'].add(d)
        if drv:
            veh_map[v]['drivers'].add(drv)
            
    for item in default_drivers:
        v = item['vehicle']
        if v not in veh_map:
            veh_map[v] = {
                'vehicle': v,
                'default_driver': item.get('default_driver', '待指定'),
                'total_trips': 0.0,
                'total_revenue': 0.0,
                'active_dates': set(),
                'drivers': set()
            }
            
    vehicles_list = []
    for v, data in sorted(veh_map.items(), key=lambda x: x[1]['total_trips'], reverse=True):
        vehicles_list.append({
            'vehicle': data['vehicle'],
            'default_driver': data['default_driver'],
            'total_trips': round(data['total_trips'], 1),
            'total_revenue': round(data['total_revenue'], 2),
            'active_days': len(data['active_dates']),
            'drivers_count': len(data['drivers']) if data['drivers'] else 1
        })
        
    return {
        "vehicles": vehicles_list,
        "rules": v_rules
    }

@router.post("/reset")
def reset_to_initial():
    if os.path.exists(CURRENT_DATA_FILE):
        os.remove(CURRENT_DATA_FILE)
    load_data()
    recalculate_all()
    return {"success": True, "message": "系统数据已成功重置为初始 Excel 基准数据！"}
