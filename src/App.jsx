import React, { useState, useMemo, useEffect } from "react";
import { supabase } from "./lib/supabase";

// =============================================================
// 选品全链路看板 · DEMO (假数据) —— 三视图: 总览 / 产品跨站 / SKU跟踪
// 假数据取自法国站现有产品, 并给部分产品加了 DE/UK 评估行以演示跨站
// =============================================================

const SITES = ["FR", "DE", "UK"];

// ---- 假数据 ----
const PRODUCTS = [
  {
    id: "p1", code: "BLOW-01", name: "吹叶机/吸叶机 双电池无刷套装", brand: "wild", store: "野趣",
    dev: "developing",
    eval: {
      FR: { node: "Souffleurs de feuilles", status: "launched", concl: "recommend", owner: "KK", report: "#" },
      DE: { node: "Laubbläser", status: "analyzing", concl: null, owner: "团队", report: null },
      UK: { node: "Leaf Blowers", status: "pending", concl: null, owner: null, report: null },
    },
    skus: [
      { id: "s1", code: "SKU-1 双电池无刷套装", site: "FR", asin: "—", price: 99.99, exec: "developing", brand: "wild" },
    ],
  },
  {
    id: "p2", code: "PUMP-AIRPRO", name: "电动充气泵 Air Pro 60PSI", brand: "Vercoryx", store: "乾数擎",
    dev: "shipping",
    eval: {
      FR: { node: "Gonfleurs et pompes électriques", status: "launched", concl: "recommend", owner: "KK", report: "#" },
      DE: { node: "Reifendruckkompressoren", status: "concluded", concl: "recommend", owner: "团队", report: "#" },
      UK: { node: "Tyre Inflators", status: "pending", concl: null, owner: null, report: null },
    },
    skus: [
      { id: "s2", code: "SKU-01 Air Pro 60PSI", site: "FR", asin: "B0GLWV84HC", price: 99.99, exec: "live", brand: "Vercoryx" },
      { id: "s3", code: "SKU-06 Air SUP 20", site: "FR", asin: "—", price: 79.99, exec: "developing", brand: "Vercoryx" },
      { id: "s4", code: "SKU-05 Air Bike Pro", site: "FR", asin: "—", price: 44.99, exec: "shipping", brand: "Vercoryx" },
      { id: "s5", code: "Gonfleur 150PSI mini", site: "DE", asin: "—", price: 39.99, exec: "planning", brand: "kinzon" },
    ],
  },
  {
    id: "p3", code: "IRRIG-01", name: "WiFi 智能灌溉控制器", brand: "wild", store: "野趣",
    dev: "researching",
    eval: {
      FR: { node: "Programmateurs d'arrosage", status: "concluded", concl: "watch", owner: "KK", report: "#" },
      DE: { node: "Bewässerungscomputer", status: "concluded", concl: "recommend", owner: "团队", report: "#" },
      UK: { node: "Water Timers", status: "pending", concl: null, owner: null, report: null },
    },
    skus: [],
  },
  {
    id: "p4", code: "FAN-01", name: "带灯吸顶风扇", brand: "kila", store: "胤顺",
    dev: "developing",
    eval: {
      FR: { node: "Ventilateurs de plafond avec lampe", status: "launched", concl: "recommend", owner: "KK", report: "#" },
      DE: { node: "Deckenventilatoren mit Lampe", status: "pending", concl: null, owner: null, report: null },
      UK: { node: "Ceiling Fans with Lights", status: "pending", concl: null, owner: null, report: null },
    },
    skus: [
      { id: "s6", code: "SKU-01 带灯吸顶风扇", site: "FR", asin: "—", price: 129.99, exec: "planning", brand: "kila" },
    ],
  },
];

// 假的跟踪时序 (仅给已 live 的 SKU)
const TRACKING = {
  s2: [
    { d: "07-28", bsr: 1420, rating: 4.3, rev: 86 },
    { d: "07-29", bsr: 1310, rating: 4.3, rev: 88 },
    { d: "07-30", bsr: 1180, rating: 4.4, rev: 91 },
    { d: "07-31", bsr: 1240, rating: 4.4, rev: 93 },
    { d: "08-01", bsr: 990, rating: 4.4, rev: 97 },
    { d: "08-02", bsr: 1050, rating: 4.4, rev: 99 },
    { d: "08-03", bsr: 870, rating: 4.5, rev: 104 },
  ],
};

// 品牌货架: 品牌 -> 大类(groups) -> 类目(cats)
// 状态: selling(在售) / ready(已分析可做) / idle(还没动) / skip(暂不做)
const BRAND_SHELF = {
  kila: { store: "胤顺", fullName: "KlimaRaum", groups: [
    { name: "Cuisine et Maison 厨房与家庭", cats: [
      { name: "Ameublement et décoration 家具与装饰", st: "idle" },
      { name: "Loisirs créatifs 创意手工", st: "idle" },
      { name: "Rangement et organisation 收纳与整理", st: "selling" },
      { name: "Aspirateurs, entretien des sols et nettoyeurs de vitres 吸尘器、地面护理与玻璃清洁", st: "idle" },
      { name: "Petit électroménager 小型家电", st: "selling" },
      { name: "Couteaux et ustensiles de cuisine 刀具与厨房用具", st: "idle" },
      { name: "Produits et accessoires de nettoyage 清洁产品与配件", st: "idle" },
      { name: "Café, thé et expresso 咖啡、茶与意式浓缩咖啡", st: "idle", chatName: "二级类目-法国-咖啡、茶和浓缩" },
      { name: "Pâtisserie 烘焙", st: "idle" },
      { name: "Casseroles, plats et poêles 锅具、烤盘与煎锅", st: "idle" },
      { name: "Vaisselle 餐具", st: "idle" },
      { name: "Chauffage et climatisation 取暖与空调", st: "idle" },
      { name: "Fers, centrales vapeur et accessoires 熨斗、蒸汽熨烫系统与配件", st: "idle" },
      { name: "Fontaines à eau, filtres et cartouches 饮水机、过滤器与滤芯", st: "idle" },
      { name: "Tableaux, posters et arts décoratifs 画作、海报与装饰艺术", st: "idle" },
    ]},
    { name: "Bricolage DIY 五金建材", cats: [
      { name: "Quincaillerie 五金", st: "idle" },
      { name: "Outillage à main et électroportatif 手动及电动工具", st: "selling" },
      { name: "Électricité 电气", st: "idle" },
      { name: "Sécurité 安全", st: "selling" },
      { name: "Peintures, outils et traitement des murs 油漆、工具及墙面处理", st: "idle" },
      { name: "Construction 建筑/施工", st: "idle" },
      { name: "Cuisines et salles de bain 厨房和浴室", st: "idle" },
      { name: "Plomberie 管道水暖（很小）", st: "skip" },
      { name: "Rangement et organisation 收纳与整理", st: "idle" },
    ]},
    { name: "Luminaires et Éclairage 灯具与照明", cats: [
      { name: "Éclairage Intelligent 智能照明", st: "idle" },
      { name: "Luminaires intérieur 室内灯具", st: "idle" },
      { name: "Luminaires extérieur 户外灯具", st: "idle" },
      { name: "Ampoules 灯泡", st: "idle" },
      { name: "Éclairage de Noël 圣诞照明", st: "idle" },
      { name: "Guirlandes lumineuses 灯串", st: "idle" },
      { name: "Éclairage de salle de bain 浴室照明", st: "idle" },
      { name: "Tubes lumineux 灯管", st: "idle" },
    ]},
  ]},
  wild: { store: "野趣", groups: [
    { name: "Jardin 花园", cats: [
      { name: "Barbecue et repas en extérieur 烧烤与户外用餐", st: "idle" },
      { name: "Chauffage extérieur et braséros 户外取暖与火盆", st: "idle" },
      { name: "Décoration d'extérieur 户外装饰", st: "idle" },
      { name: "Déneigement 除雪用品", st: "idle" },
      { name: "Élevage et agriculture urbaine 饲养与城市农业", st: "idle" },
      { name: "Jardinage 园艺", st: "idle" },
      { name: "Mobilier de jardin 花园家具/户外家具", st: "idle" },
      { name: "Oiseaux et animaux sauvages 鸟类与野生动物用品", st: "idle" },
      { name: "Piscines, spas et accessoires 泳池、SPA 及配件", st: "idle" },
      { name: "Plantes, graines et bulbes 植物、种子与球茎", st: "skip" },
      { name: "Rangement et stockage extérieurs 户外收纳与储物", st: "idle" },
      { name: "Terrasses en bois et clôtures 木质露台与围栏", st: "idle" },
      { name: "Thermomètres et instruments météorologiques extérieur 户外温度计与气象仪器", st: "idle" },
      { name: "Tondeuses et outillage de jardin motorisé 割草机与电动园艺工具", st: "idle" },
    ]},
    { name: "Sports et Loisirs 运动户外", cats: [
      { name: "Accessoires de sports 运动配件", st: "idle" },
      { name: "Boutique des Supporters 球迷用品商店", st: "idle" },
      { name: "Chaussures de sport 运动鞋", st: "idle" },
      { name: "Divers jeux 各类游戏", st: "idle" },
      { name: "Électronique 运动电子设备", st: "idle" },
      { name: "Fitness et musculation 健身与力量训练", st: "idle" },
      { name: "Médécine du sport 运动医学", st: "idle" },
      { name: "Sport de disque 飞盘类运动", st: "idle" },
      { name: "Trophées 奖杯", st: "idle" },
      { name: "Vêtements de sport 运动服饰", st: "idle" },
      { name: "Activités de plein air 户外活动", st: "selling" },
      { name: "Chasse et pêche 狩猎与钓鱼", st: "idle" },
      { name: "Sports 体育运动", st: "selling" },
    ]},
  ]},
  Vercoryx: { store: "乾数擎", groups: [
    { name: "Auto et Moto 汽车与摩托", cats: [
      { name: "Accessoires auto 汽车配件", st: "idle" },
      { name: "Appareils GPS GPS 设备", st: "skip" },
      { name: "Cadeaux et produits dérivés 礼品与周边产品", st: "idle" },
      { name: "Électronique embarquée 车载电子设备", st: "idle" },
      { name: "Entretien auto et moto 汽车与摩托车养护", st: "idle" },
      { name: "Huiles et liquides 机油与液体", st: "skip" },
      { name: "Motos, accessoires et pièces 摩托车、配件与零件", st: "idle" },
      { name: "Outils et dépannage 工具与故障救援", st: "idle" },
      { name: "Peinture 汽车漆", st: "skip" },
      { name: "Pièces détachées auto 汽车零部件", st: "selling" },
      { name: "Pièces et accessoires pour camping-car 房车零件与配件", st: "idle" },
      { name: "Pièces et équipements pour véhicules agricoles 农用车辆零件与设备", st: "idle" },
      { name: "Pneus et jantes 轮胎与轮毂", st: "idle" },
      { name: "Sièges auto et accessoires 汽车座椅与配件", st: "idle" },
      { name: "Transport et rangement 运输与收纳", st: "idle" },
    ]},
  ]},
  woof: { store: "屿阔", fullName: "Woofinity", groups: [
    { name: "Animalerie 宠物", cats: [
      { name: "Chiens 狗", st: "ready" },
      { name: "Chats 猫", st: "idle" },
      { name: "Aquariophilie 水族/观赏鱼", st: "idle" },
      { name: "Petits animaux 小动物", st: "idle" },
      { name: "Reptiles et amphibiens 爬行动物和两栖动物", st: "idle" },
      { name: "Oiseaux 鸟类", st: "idle" },
      { name: "Animaux de Compagnie Alimentation 宠物食品/宠物营养", st: "skip" },
    ]},
    { name: "Jeux et Jouets 玩具（待录入）", cats: [] },
  ]},
  kinzon: { store: "乾霖", groups: [
    { name: "High-Tech 电子/高科技", cats: [
      { name: "Casques, écouteurs et accessoires 耳机、耳塞与配件", st: "idle" },
      { name: "Cigarettes électroniques, chichas et accessoires 电子烟、水烟与配件", st: "skip" },
      { name: "Électronique embarquée 车载电子设备", st: "idle" },
      { name: "GPS et accessoires GPS 与配件", st: "idle" },
      { name: "Liseuses et accessoires 电子书阅读器与配件", st: "skip" },
      { name: "Photo et caméscopes 摄影与摄像机", st: "idle" },
      { name: "Piles, chargeurs et testeurs 电池、充电器与测试仪", st: "idle" },
      { name: "Radios et accessoires 收音机与配件", st: "idle" },
      { name: "Technologie portable 可穿戴技术/智能穿戴", st: "idle" },
      { name: "Téléphones fixes, VoIP et accessoires 固定电话、VoIP 电话与配件", st: "idle" },
      { name: "Téléphones portables et accessoires 手机与配件", st: "idle" },
      { name: "TV, vidéo et home cinéma 电视、视频与家庭影院", st: "idle" },
      { name: "Univers Hi-Fi 高保真音响/Hi-Fi 音响", st: "skip" },
      { name: "Audio et vidéo portable 便携式音频与视频", st: "idle" },
      { name: "Alimentation et accessoires 电源与附件（待拆 6 细分）", st: "idle" },
    ]},
    { name: "Informatique 电脑与信息技术", cats: [
      { name: "Accessoires 电脑配件", st: "idle" },
      { name: "Composants et pièces de remplacement 组件与更换零件", st: "idle" },
      { name: "Imprimantes et accessoires 打印机及配件", st: "idle" },
      { name: "Mémoire 存储", st: "idle" },
      { name: "Réseaux 网络设备", st: "idle" },
      { name: "Scanners et accessoires 扫描仪及配件", st: "idle" },
      { name: "Ordinateurs de bureau 台式电脑", st: "idle" },
      { name: "Ordinateurs portables 笔记本电脑", st: "idle" },
      { name: "PC Gaming 游戏电脑", st: "idle" },
      { name: "Écrans PC 电脑显示器", st: "idle" },
      { name: "Tablettes tactiles 平板电脑", st: "idle" },
      { name: "Ardoises numériques et eWriters 电子手写板", st: "idle" },
      { name: "Barebones 准系统", st: "idle" },
      { name: "Serveurs 服务器", st: "idle" },
    ]},
    { name: "Fournitures de bureau 办公用品", cats: [
      { name: "Calendriers, agendas et organiseurs 日历、日程本与计划用品", st: "idle" },
      { name: "Écriture 书写用品", st: "idle" },
      { name: "Enveloppes et fournitures d'expédition 信封与邮寄用品", st: "idle" },
      { name: "Fournitures d'école 学校用品", st: "idle" },
      { name: "Fournitures électroniques 办公电子用品", st: "idle" },
      { name: "Mobilier et éclairage 家具与照明", st: "idle" },
      { name: "Papeterie 纸品文具", st: "idle" },
      { name: "Petites fournitures 小型办公用品", st: "idle" },
    ]},
    { name: "Commerce, Industrie et Science 商业、工业与科学", cats: [
      { name: "Énergie solaire et éolienne 太阳能与风能", st: "idle" },
      { name: "Équipement de transmission d'énergie 动力传动设备", st: "idle" },
      { name: "Équipement dentaire 牙科设备", st: "idle" },
      { name: "Équipement électrique industriel 工业电气设备", st: "idle" },
      { name: "Équipement et fournitures agricoles 农业设备与用品", st: "idle" },
      { name: "Équipement pour magasins et rayonnage 商店设备与货架", st: "idle" },
      { name: "Équipements et fournitures de restauration 餐饮设备与用品", st: "idle" },
      { name: "Filtrage 过滤设备", st: "idle" },
      { name: "Fournitures de conditionnement et d'expédition 包装与运输用品", st: "idle" },
      { name: "Fournitures de nettoyage et d'entretien 清洁与维护用品", st: "idle" },
      { name: "Fournitures éducatives 教育用品", st: "idle" },
      { name: "Fournitures médicales professionnelles 专业医疗用品", st: "idle" },
      { name: "Hydraulique, pneumatique et plomberie 液压、气动与管道", st: "idle" },
      { name: "Impression et numérisation 3D 3D 打印与扫描", st: "idle" },
      { name: "Matières premières 原材料", st: "idle" },
      { name: "Outils de coupe 切削工具", st: "idle" },
      { name: "Outils manuels et électriques 手动与电动工具", st: "idle" },
      { name: "Produits abrasifs et de finition 研磨与表面处理产品", st: "idle" },
      { name: "Produits de manutention 物料搬运产品", st: "idle" },
      { name: "Produits professionnels de sécurité et de santé 职业安全与健康产品", st: "idle" },
      { name: "Produits scientifiques et de laboratoire 科学与实验室用品", st: "idle" },
      { name: "Test et mesurage 测试与测量", st: "idle" },
    ]},
    { name: "Mode 时尚", cats: [
      { name: "Porte-cigarettes 烟盒", st: "selling" },
    ]},
    { name: "Hygiène et Santé 卫生与健康 - 猪猪侠", cats: [
      { name: "Pompes à pénis 增大泵", st: "selling" },
    ]},
    { name: "户外-光学", cats: [
      { name: "Balles 弹丸", st: "skip" },
      { name: "Batteries 电池", st: "idle" },
      { name: "Billes BB 弹", st: "skip" },
      { name: "Chargeurs 弹匣", st: "idle" },
      { name: "Chargeurs batterie 电池充电器", st: "idle" },
      { name: "Cibles 靶子", st: "idle" },
      { name: "Fixations de lunettes de tir 瞄准镜固定件", st: "idle" },
      { name: "Gilets tactiques 战术背心", st: "idle" },
      { name: "Grenades 手雷", st: "skip" },
      { name: "Gun Loaders 快速装弹器", st: "idle" },
      { name: "Holsters 枪套", st: "idle" },
      { name: "Lasers 激光瞄准", st: "idle" },
      { name: "Lunettes de visée 瞄准镜", st: "idle" },
      { name: "Mallettes et housses 枪箱与枪包", st: "idle" },
      { name: "Outils 工具", st: "idle" },
      { name: "Pistolets et fusils 手枪与步枪", st: "idle" },
      { name: "Protections 防护装备", st: "idle" },
      { name: "Rails 导轨", st: "idle" },
      { name: "Sets 套装", st: "idle" },
      { name: "Support pour arme à feu 枪械支架", st: "idle" },
      { name: "Tenue de camouflage 迷彩服", st: "idle" },
      { name: "Visières 面罩/护目镜", st: "idle" },
    ]},
  ]},
  _未归属: { store: "无品牌归属", flat: true, groups: [
    { name: "__flat__", cats: [
      { name: "Beauté et Parfum 美妆与香水", st: "idle" },
      { name: "Bébé et Puériculture 婴儿与育儿", st: "idle" },
      { name: "Epicerie 食品杂货", st: "idle" },
      { name: "Gros électroménager 大型家电", st: "idle" },
      { name: "Instruments de musique et Sono 乐器与音响", st: "idle" },
      { name: "Jeux vidéo 电子游戏", st: "idle" },
      { name: "Produits Handmade 手工艺品", st: "idle" },
    ]},
  ]},
};
const SHELF_ST = {
  selling: { label: "在售", color: "#4db6a4" },
  ready:   { label: "已分析可做", color: "#d9a441" },
  idle:    { label: "还没动", color: "#5b6670" },
  skip:    { label: "暂不做", color: "#7a5b52" },
};

// 类目详情: 点开类目后展开的 产品 / 供应商 两分支 (key = 类目名前缀匹配)
// 供应商仍是独立维度, 这里展示与该类目相关的供应商
const CAT_DETAIL = {
  "Sports 体育运动": {
    leaves: [
      {
        leaf: "Raquettes à neige 雪地鞋",
        path: "Sports et Loisirs › Sports › Sports d'hiver › Raquettes à neige › Raquettes à neige",
        products: [
          { name: "雪地鞋01", st: "selling" },
          { name: "雪地鞋02", st: "selling" },
          { name: "雪地鞋03", st: "selling" },
        ],
        suppliers: [],
      },
    ],
  },
  "Accessoires auto 汽车配件": {
    leaves: [
      {
        leaf: "Systèmes de surveillance de pression des pneus TPMS 胎压监测系统",
        path: "Auto et Moto › Accessoires auto › Systèmes de surveillance de pression des pneus",
        st: "researched_skip",
        products: [],
        suppliers: [],
        chatName: "法国-TPMS胎压监测系统",
      },
    ],
  },
  "Sécurité 安全": {
    leaves: [
      {
        leaf: "Sonnettes vidéo 可视门铃",
        path: "Bricolage › Sécurité › Systèmes sécurité pour la maison › Sonnettes vidéo",
        products: [{ name: "可视门铃01", st: "selling" }],
        suppliers: [],
        chatName: "产品矩阵-法国-建材diy-可视门铃",
      },
    ],
  },
  "Tondeuses et outillage de jardin motorisé 割草机与电动园艺工具": {
    leaves: [
      {
        leaf: "Souffleurs et aspirateurs de feuilles 吹叶机/吸叶机",
        path: "Jardin › Tondeuses et outillage de jardin motorisé › Souffleurs et aspirateurs de feuilles",
        st: "idle",
        products: [],
        suppliers: [],
        chatName: "吹叶机",
      },
    ],
  },
  "Activités de plein air 户外活动": {
    leaves: [
      {
        leaf: "Gonfleurs et pompes électriques 户外电动充气泵",
        path: "Sports et Loisirs › Activités de plein air › Camping et randonnée › Couchage › Gonfleurs et pompes › Gonfleurs et pompes électriques",
        products: [{ name: "户外充气泵", st: "selling" }],
        suppliers: [],
      },
    ],
  },
  "Outils et dépannage 工具与故障救援": {
    leaves: [
      {
        leaf: "Caméras d'inspection 检测摄像头（内窥镜）",
        path: "Auto et Moto › Outils et dépannage › Outils de diagnostics, tests et mesures › Caméras d'inspection",
        st: "idle",
        products: [],
        suppliers: [],
        chatName: "产品矩阵-法国-汽配-内窥镜",
      },
      {
        leaf: "OBD & lecteurs de codes OBD-II 诊断仪",
        path: "Auto et Moto › Outils et dépannage › Outils de diagnostics, tests et mesures › OBD & lecteurs de codes",
        st: "idle",
        products: [],
        suppliers: [],
        chatName: "法国-OBD-II诊断仪",
      },
    ],
  },
  "Pompes à pénis 增大泵": {
    leaves: [
      {
        leaf: "Pompes à pénis 增大泵",
        path: "Hygiène et Santé › Érotisme, sexe et sensualité › Lubrifiants, stimulants et hygiène › Pompes à pénis",
        products: [
          { name: "手动01", st: "selling" },
          { name: "电动01", st: "selling" },
          { name: "电动02", st: "selling" },
        ],
        suppliers: [],
      },
    ],
  },
  "Porte-cigarettes 烟盒": {
    leaves: [
      {
        leaf: "Porte-cigarettes 烟盒（男士皮夹类）",
        path: "Mode › Bagages, sacs de voyage et accessoires › Portefeuilles et porte-cartes › Homme › Porte-cigarettes",
        products: [{ name: "烟盒01", st: "selling" }, { name: "烟盒02", st: "selling" }],
        suppliers: [],
      },
    ],
  },
  "Pièces détachées auto 汽车零部件": {
    leaves: [
      {
        leaf: "Feux arrière 后尾灯",
        path: "Auto et Moto › Pièces détachées auto › Feux, ampoules et clignotants › Éclairages et composants › Feux arrière",
        products: [{ name: "e11", st: "selling" }, { name: "e12", st: "selling" }],
        suppliers: [],
      },
    ],
  },
  "Cuisine et Maison 厨房与家庭 || Rangement et organisation 收纳与整理": {
    leaves: [
      {
        leaf: "Housses de rangement sous vide 真空压缩收纳袋",
        path: "Cuisine et Maison › Rangement et organisation › Rangement pour vêtements et penderies › Housses de rangement sous vide",
        products: [{ name: "衣服真空泵", st: "selling" }],
        suppliers: [],
      },
    ],
  },
  "Outillage à main et électroportatif 手动及电动工具": {
    leaves: [
      {
        leaf: "Compresseurs d'air 空气压缩机",
        path: "Bricolage › Outillage à main et électroportatif › Outillage électroportatif › Compresseurs d'air",
        products: [{ name: "汽车充气泵", st: "selling" }],
        suppliers: [],
      },
    ],
  },
  "Petit électroménager 小型家电": {
    leaves: [
      {
        leaf: "Appareils de mise sous vide 真空封口机",
        path: "Cuisine et Maison › Petit électroménager › Appareils de mise sous vide",
        products: [{ name: "封口机01", st: "selling" }, { name: "封口机02", st: "selling" }],
        suppliers: [],
      },
    ],
  },
  "Chats 猫": {
    leaves: [
      {
        leaf: "Distributeurs automatiques de nourriture 自动喂食器",
        path: "Animalerie › Chats › Mangeoirs et abreuvoirs › Distributeurs automatiques de nourriture",
        st: "idle",
        products: [],
        suppliers: [],
      },
      {
        leaf: "Fontaines 饮水器",
        path: "Animalerie › Chats › Mangeoirs et abreuvoirs › Fontaines",
        st: "idle",
        products: [],
        suppliers: [],
      },
    ],
  },
  "Chiens 狗": {
    leaves: [
      {
        leaf: "Colliers anti-aboiement 防吠项圈",
        path: "Animalerie › Chiens › Colliers, harnais et laisses › Colliers › Colliers anti-aboiement",
        products: [{ name: "宠物项圈01", st: "selling" }],
        suppliers: [],
      },
      {
        leaf: "Clôtures anti-fugue 防逃电子围栏",
        path: "Animalerie › Chiens › Câbles et piquets d'attache › Clôtures anti-fugue",
        products: [{ name: "电子围栏01", st: "selling" }],
        suppliers: [],
      },
      {
        leaf: "Rehausseurs et sièges autos 增高垫与汽车座椅",
        path: "Animalerie › Chiens › Transport et voyages › Accessoires voiture › Rehausseurs et sièges autos",
        products: [{ name: "车载宠物屋-大-黑", st: "selling" }],
        suppliers: [],
      },
      {
        leaf: "Tondeuses électriques 电动理毛器",
        path: "Animalerie › Chiens › Toilettage › Tondeuses électriques et peignes › Tondeuses électriques",
        st: "idle",
        products: [],
        suppliers: [],
      },
      {
        leaf: "Douchettes et pulvérisateurs 花洒与喷头",
        path: "Animalerie › Chiens › Toilettage › Articles de bain et de douche › Douchettes et pulvérisateurs",
        st: "idle",
        products: [],
        suppliers: [],
      },
    ],
  },
  "Programmateurs d'arrosage": {
    products: [
      { name: "WiFi 智能灌溉控制器 SKU-1", st: "ready" },
    ],
    suppliers: [
      { factory: "Hanci Electrical 汉慈电气", contact: "王经理 · wechat hanci_wang", products: "WiFi 灌溉控制器、智能水阀" },
    ],
  },
  "Ventilateurs de plafond": {
    products: [
      { name: "带灯吸顶风扇 SKU-01", st: "selling" },
    ],
    suppliers: [
      { factory: "示例工厂 · 吸顶风扇", contact: "李工 · 138-0000-0000", products: "吸顶风扇、灯具" },
    ],
  },
};
function catDetail(name, groupName) {
  if (groupName) {
    const scoped = `${groupName} || ${name}`;
    if (CAT_DETAIL[scoped]) return CAT_DETAIL[scoped];
  }
  if (CAT_DETAIL[name]) return CAT_DETAIL[name];
  const key = Object.keys(CAT_DETAIL).find(k => !k.includes(" || ") && (name.startsWith(k) || name.includes(k)));
  return key ? CAT_DETAIL[key] : null;
}



const FUNNEL = [
  { key: "pending", label: "待分析" },
  { key: "analyzing", label: "分析中" },
  { key: "concluded", label: "已出结论" },
  { key: "launched", label: "已立项" },
];
const EXEC = [
  { key: "planning", label: "规划" },
  { key: "developing", label: "开发" },
  { key: "shipping", label: "在途" },
  { key: "live", label: "已上架" },
  { key: "tracking", label: "跟踪" },
];

const C = {
  bg: "#101418", panel: "#171d23", panel2: "#1e262e", line: "#2a333c",
  ink: "#e8edf2", sub: "#8b97a3", faint: "#5b6670",
  brand: "#4db6a4", // 主色 teal
  rec: "#4db6a4", watch: "#d9a441", drop: "#c05b52",
  fr: "#4db6a4", de: "#6f8fd0", uk: "#c08fd0",
};

const conclColor = (c) => c === "recommend" ? C.rec : c === "watch" ? C.watch : c === "drop" ? C.drop : C.faint;
const conclText = (c) => c === "recommend" ? "推荐" : c === "watch" ? "观望" : c === "drop" ? "放弃" : "—";
const statusText = (s) => (FUNNEL.find(f => f.key === s) || {}).label || s;
const execText = (s) => (EXEC.find(f => f.key === s) || {}).label || s;

// ---- 登录页 ----
function Login() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) setErr(error.message);
    setBusy(false);
  };

  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: "100vh", fontFamily: "'Inter',system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 360, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 32 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>选品全链路看板</div>
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 28 }}>KinZon SAS · 登录</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 5 }}>邮箱</div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
            style={{ width: "100%", padding: "10px 12px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 5 }}>密码</div>
          <input value={pw} onChange={e => setPw(e.target.value)} type="password" placeholder="••••••"
            onKeyDown={e => e.key === "Enter" && go()}
            style={{ width: "100%", padding: "10px 12px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.ink, fontSize: 13, outline: "none" }} />
        </div>
        {err && <div style={{ fontSize: 12, color: "#c05b52", marginBottom: 14 }}>{err}</div>}
        <button onClick={go} disabled={busy}
          style={{ width: "100%", padding: "10px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "登录中…" : "登 录"}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined=loading, null=not logged in
  const [tab, setTab] = useState("overview");
  const [sel, setSel] = useState(null);
  const [selSku, setSelSku] = useState("s2");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // 加载中
  if (session === undefined) return (
    <div style={{ background: C.bg, color: C.sub, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter',system-ui,sans-serif" }}>
      加载中…
    </div>
  );

  // 未登录 → 登录页
  if (!session) return <Login />;

  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: "100vh", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; }
        .tab { padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px; letter-spacing:.02em; border:1px solid transparent; }
        .tab:hover { background:${C.panel2}; }
        .cell:hover { background:${C.panel2}; }
        .prow:hover { background:${C.panel2}; cursor:pointer; }
      `}</style>

      {/* header */}
      <div style={{ borderBottom: `1px solid ${C.line}`, padding: "18px 28px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: ".01em" }}>选品全链路看板</div>
        <div style={{ fontSize: 12, color: C.sub }}>KinZon · FR / DE / UK</div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: C.faint }}>{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}
            style={{ fontSize: 11, color: C.sub, background: "transparent", border: `1px solid ${C.line}`, padding: "3px 10px", borderRadius: 6, cursor: "pointer" }}>
            退出
          </button>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: "flex", gap: 6, padding: "14px 24px 0" }}>
        {[["overview", "总览看板"], ["shelf", "品牌货架"], ["cross", "产品跨站"], ["track", "SKU 跟踪"]].map(([k, l]) => (
          <div key={k} className="tab" onClick={() => setTab(k)}
            style={{ background: tab === k ? C.panel : "transparent", border: tab === k ? `1px solid ${C.line}` : "1px solid transparent", color: tab === k ? C.ink : C.sub }}>
            {l}
          </div>
        ))}
      </div>

      <div style={{ padding: "20px 24px 60px" }}>
        {tab === "overview" && <Overview onPick={(p) => { setSel(p); setTab("cross"); }} />}
        {tab === "shelf" && <Shelf />}
        {tab === "cross" && <CrossSite sel={sel} setSel={setSel} />}
        {tab === "track" && <Track selSku={selSku} setSelSku={setSelSku} />}
      </div>
    </div>
  );
}

// ---------------- 总览: 站点 × 漏斗状态 矩阵 ----------------
function Overview({ onPick }) {
  const matrix = useMemo(() => {
    const m = {};
    SITES.forEach(s => { m[s] = {}; FUNNEL.forEach(f => m[s][f.key] = []); });
    PRODUCTS.forEach(p => SITES.forEach(s => {
      const e = p.eval[s]; if (e) m[s][e.status].push(p);
    }));
    return m;
  }, []);

  return (
    <div>
      <SectionTitle t="漏斗总览" sub="每格 = 该站点处于该状态的类目数量，点击类目跳转跨站对比" />
      <div style={{ display: "grid", gridTemplateColumns: `72px repeat(${FUNNEL.length},1fr)`, gap: 1, background: C.line, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ background: C.panel }} />
        {FUNNEL.map(f => (
          <div key={f.key} style={{ background: C.panel, padding: "10px 12px", fontSize: 12, color: C.sub, fontWeight: 600 }}>{f.label}</div>
        ))}
        {SITES.map(s => (
          <React.Fragment key={s}>
            <div style={{ background: C.panel, padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: C[s.toLowerCase()] }}>{s}</div>
            {FUNNEL.map(f => (
              <div key={f.key} className="cell" style={{ background: C.panel, padding: "10px 12px", minHeight: 78 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: matrix[s][f.key].length ? C.ink : C.faint }}>{matrix[s][f.key].length}</div>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                  {matrix[s][f.key].map(p => (
                    <div key={p.id} onClick={() => onPick(p)} style={{ fontSize: 11, color: C.sub, cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 2 }}>{p.name}</div>
                  ))}
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      <div style={{ marginTop: 28 }}>
        <SectionTitle t="全部产品" sub="按产品看它在各站点的评估结论" />
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr .7fr repeat(3,.8fr)", background: C.panel, fontSize: 11, color: C.sub, fontWeight: 600 }}>
            {["产品", "品牌", "FR", "DE", "UK"].map((h, i) => <div key={i} style={{ padding: "10px 14px" }}>{h}</div>)}
          </div>
          {PRODUCTS.map(p => (
            <div key={p.id} className="prow" onClick={() => onPick(p)} style={{ display: "grid", gridTemplateColumns: "1.6fr .7fr repeat(3,.8fr)", borderTop: `1px solid ${C.line}`, fontSize: 12, background: C.panel }}>
              <div style={{ padding: "12px 14px" }}>{p.name}<div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{p.code}</div></div>
              <div style={{ padding: "12px 14px", color: C.sub }}>{p.brand}</div>
              {SITES.map(s => {
                const e = p.eval[s];
                return <div key={s} style={{ padding: "12px 14px" }}>
                  {e ? <Pill color={conclColor(e.concl)} text={e.concl ? conclText(e.concl) : statusText(e.status)} /> : <span style={{ color: C.faint }}>—</span>}
                </div>;
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------- 产品跨站对比 ----------------
// 从货架聚合出可搜索的条目: 产品 + 末端类目
function collectSearchable() {
  const items = [];
  Object.keys(BRAND_SHELF).forEach(brandKey => {
    const brand = BRAND_SHELF[brandKey];
    if (brand.flat) return;
    brand.groups.forEach(g => {
      g.cats.forEach(c => {
        if (c.st === "skip") return;
        const detail = catDetail(c.name, g.name);
        if (!detail || !detail.leaves) return;
        detail.leaves.forEach(lf => {
          // 末端类目本身作为一条
          items.push({
            type: "leaf",
            name: lf.leaf,
            path: lf.path,
            brand: brand.fullName || brandKey,
            store: brand.store,
            group: g.name,
            parentCat: c.name,
            frStatus: lf.products && lf.products.some(p => p.st === "selling") ? "已立项" : (lf.st === "idle" ? "分析中" : "已出结论"),
            frConclusion: lf.products && lf.products.some(p => p.st === "selling") ? "recommend" : null,
            products: lf.products || [],
            suppliers: lf.suppliers || [],
          });
          // 每个产品也作为一条
          (lf.products || []).forEach(p => {
            items.push({
              type: "product",
              name: p.name,
              path: lf.path,
              leafName: lf.leaf,
              brand: brand.fullName || brandKey,
              store: brand.store,
              group: g.name,
              parentCat: c.name,
              frStatus: p.st === "selling" ? "已立项" : "分析中",
              frConclusion: p.st === "selling" ? "recommend" : null,
              productStatus: p.st,
              suppliers: lf.suppliers || [],
            });
          });
        });
      });
    });
  });
  return items;
}

function CrossSite({ sel, setSel }) {
  const [q, setQ] = useState("");
  const [siteMark, setSiteMark] = useState({}); // {itemIdx-site: 'analyzing'}
  const all = useMemo(() => collectSearchable(), []);
  const matches = q.trim()
    ? all.filter(i => i.name.toLowerCase().includes(q.toLowerCase()) || (i.leafName || "").toLowerCase().includes(q.toLowerCase()))
    : [];
  const [selIdx, setSelIdx] = useState(0);
  const item = matches[selIdx] || null;

  return (
    <div>
      <SectionTitle t="产品跨站对比" sub="搜索类目名或产品名 — 查看在 FR / DE / UK 三站的评估状态" />

      {/* 搜索框 */}
      <div style={{ marginBottom: 18 }}>
        <input value={q} onChange={(e) => { setQ(e.target.value); setSelIdx(0); }}
          placeholder="输入类目名或产品名，如 防吠项圈 / 电子围栏01 / 封口机..."
          style={{ width: "100%", padding: "11px 14px", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, color: C.ink, fontSize: 13, outline: "none" }} />
        {q.trim() && (
          <div style={{ marginTop: 4, fontSize: 11, color: C.sub }}>
            找到 {matches.length} 条 · 全库共 {all.length} 条可搜索
          </div>
        )}
      </div>

      {/* 匹配结果列表 (多条时显示) */}
      {matches.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {matches.slice(0, 10).map((m, i) => (
            <div key={i} onClick={() => setSelIdx(i)} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 8, cursor: "pointer", border: `1px solid ${i === selIdx ? C.brand : C.line}`, background: i === selIdx ? C.panel2 : "transparent", color: i === selIdx ? C.ink : C.sub }}>
              {m.type === "product" ? "▪ " : "◆ "}{m.name}
            </div>
          ))}
          {matches.length > 10 && <div style={{ fontSize: 11, color: C.faint, padding: "6px 4px" }}>+{matches.length - 10} 条未显示，请细化关键词</div>}
        </div>
      )}

      {!q.trim() && (
        <div style={{ padding: 40, textAlign: "center", color: C.faint, fontSize: 13, border: `1px dashed ${C.line}`, borderRadius: 12 }}>
          输入关键词搜索。<br />
          共 {all.length} 条可搜索（{all.filter(x => x.type === "leaf").length} 个末端类目 + {all.filter(x => x.type === "product").length} 个产品）。
        </div>
      )}

      {q.trim() && !item && (
        <div style={{ padding: 40, textAlign: "center", color: C.faint, fontSize: 13, border: `1px dashed ${C.line}`, borderRadius: 12 }}>
          未找到匹配项
        </div>
      )}

      {item && (
        <>
          {/* 命中项概览 */}
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>{item.type === "product" ? "产品" : "末端类目"}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{item.name}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{item.brand} · {item.store} · {item.group}</div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 6 }}>{item.path}</div>
          </div>

          {/* 三站卡片 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
            {["FR", "DE", "UK"].map(site => {
              const isFR = site === "FR";
              const mark = siteMark[`${selIdx}-${site}`];
              const evaluated = isFR || mark;
              return (
                <div key={site} style={{ background: C.panel, border: `1px solid ${evaluated ? (isFR && item.frConclusion === "recommend" ? "#4db6a4" : C.line) : C.line}`, borderRadius: 12, padding: 16, minHeight: 180, opacity: evaluated ? 1 : 0.85 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, color: site === "FR" ? "#4db6a4" : site === "DE" ? "#6f8fd0" : "#c08fd0" }}>{site}</span>
                    {isFR && <span style={{ fontSize: 11, color: "#4db6a4" }}>在售/在调研</span>}
                    {!isFR && (mark ? <span style={{ fontSize: 11, color: C.sub }}>{mark === "analyzing" ? "分析中" : "已评估"}</span>
                      : <span style={{ fontSize: 11, color: C.faint }}>未评估</span>)}
                  </div>

                  {isFR ? (
                    <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.8 }}>
                      <div style={{ color: C.sub }}>状态</div>
                      <div>{item.frStatus}</div>
                      {item.type === "product" && (
                        <>
                          <div style={{ color: C.sub, marginTop: 8 }}>产品状态</div>
                          <div>{SHELF_ST[item.productStatus]?.label}</div>
                        </>
                      )}
                      {item.type === "leaf" && (
                        <>
                          <div style={{ color: C.sub, marginTop: 8 }}>产品数</div>
                          <div>{item.products.length}</div>
                        </>
                      )}
                    </div>
                  ) : mark ? (
                    <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.8, color: C.sub }}>
                      <div>已标记为「{mark === "analyzing" ? "分析中" : "已评估"}」</div>
                      <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>Demo：真库版此处显示具体评估内容</div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 20, fontSize: 12, color: C.faint, textAlign: "center" }}>
                      尚未在 {site} 站评估
                    </div>
                  )}

                  {!isFR && !mark && (
                    <button onClick={() => setSiteMark(s => ({ ...s, [`${selIdx}-${site}`]: "analyzing" }))}
                      style={{ marginTop: 14, width: "100%", padding: "7px", background: "transparent", border: `1px solid ${C.line}`, color: C.sub, borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
                      标记为分析中
                    </button>
                  )}
                  {!isFR && mark && (
                    <button onClick={() => setSiteMark(s => ({ ...s, [`${selIdx}-${site}`]: undefined }))}
                      style={{ marginTop: 14, width: "100%", padding: "7px", background: "transparent", border: `1px solid ${C.line}`, color: C.faint, borderRadius: 8, fontSize: 11, cursor: "pointer" }}>
                      取消标记
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- SKU 跟踪 ----------------
function Track({ selSku, setSelSku }) {
  const liveSkus = PRODUCTS.flatMap(p => p.skus.filter(s => s.exec === "live").map(s => ({ ...s, pname: p.name })));
  const data = TRACKING[selSku] || [];
  const cur = liveSkus.find(s => s.id === selSku);

  const maxBsr = Math.max(...data.map(d => d.bsr), 1);
  const minBsr = Math.min(...data.map(d => d.bsr), 0);
  const W = 640, H = 200, pad = 30;
  const x = (i) => pad + (i * (W - 2 * pad)) / (data.length - 1);
  const y = (v) => pad + ((v - minBsr) / (maxBsr - minBsr || 1)) * (H - 2 * pad); // BSR 越小越好, 高位=差

  return (
    <div>
      <SectionTitle t="SKU 跟踪" sub="已上架 SKU 的 BSR / 评分 / 评论趋势（BSR 越低越好）" />
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {liveSkus.map(s => (
          <div key={s.id} onClick={() => setSelSku(s.id)} style={{ padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: `1px solid ${s.id === selSku ? C.brand : C.line}`, background: s.id === selSku ? C.panel2 : "transparent", color: s.id === selSku ? C.ink : C.sub }}>{s.code} <span style={{ color: C.faint }}>· {s.site}</span></div>
        ))}
      </div>

      {cur && (
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{cur.code}</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>{cur.pname} · {cur.site} · ASIN {cur.asin}</div>
            </div>
            <button style={btn(C)} onClick={() => alert("Demo：真库版会触发 BSR 抓取 skill，写入 sku_tracking")}>拉取最新 BSR</button>
          </div>

          {data.length ? (
            <>
              <div style={{ display: "flex", gap: 20, margin: "18px 0" }}>
                <Stat label="最新 BSR" value={`#${data[data.length - 1].bsr}`} accent={C.brand} />
                <Stat label="评分" value={data[data.length - 1].rating} />
                <Stat label="评论数" value={data[data.length - 1].rev} />
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
                <polyline fill="none" stroke={C.brand} strokeWidth="2"
                  points={data.map((d, i) => `${x(i)},${y(d.bsr)}`).join(" ")} />
                {data.map((d, i) => (
                  <g key={i}>
                    <circle cx={x(i)} cy={y(d.bsr)} r="3.5" fill={C.brand} />
                    <text x={x(i)} y={H - 8} fontSize="10" fill={C.faint} textAnchor="middle">{d.d}</text>
                  </g>
                ))}
              </svg>
            </>
          ) : <div style={{ fontSize: 12, color: C.faint, marginTop: 16 }}>暂无跟踪数据</div>}
        </div>
      )}
    </div>
  );
}

// ---------------- 品牌货架 (三层展开: 品牌 → 大类 → 类目) ----------------
function Shelf() {
  const brands = Object.keys(BRAND_SHELF);
  const [openB, setOpenB] = useState({});      // 展开的品牌
  const [openG, setOpenG] = useState({});      // 展开的大类, key = brand|groupIdx
  const [openC, setOpenC] = useState({});      // 展开的类目, key = brand|groupIdx|catIdx
  const [filterC, setFilterC] = useState({});  // 每个类目的筛选: undefined|'selling'|'idle'
  const [openL, setOpenL] = useState({});      // 展开的末端类目, key = ckey|leafIdx
  const [projectFor, setProjectFor] = useState(null); // 跳转 Project 弹窗

  const countCats = (groups) => {
    const n = { total: 0, selling: 0, ready: 0, idle: 0, skip: 0 };
    groups.forEach(g => g.cats.forEach(c => { n.total++; n[c.st]++; }));
    return n;
  };

  return (
    <div>
      <SectionTitle t="品牌货架" sub="品牌 → 大类 → 类目，逐层点开。标记已分析可做 / 在售 / 还没动 / 暂不做" />

      {/* 图例 */}
      <div style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        {Object.entries(SHELF_ST).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.sub }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color, display: "inline-block" }} />{v.label}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {brands.map(b => {
          const info = BRAND_SHELF[b];
          const n = countCats(info.groups);
          const isOpen = !!openB[b];
          return (
            <div key={b} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
              {/* 品牌行 */}
              <div onClick={() => setOpenB(s => ({ ...s, [b]: !s[b] }))}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", cursor: "pointer" }}>
                <Caret open={isOpen} />
                <span style={{ fontSize: 15, fontWeight: 700 }}>{info.fullName || b}</span>
                <span style={{ fontSize: 11, color: C.faint }}>{info.store}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: C.sub }}>
                  {info.flat ? `${n.total} 类目` : `${info.groups.length} 大类 · ${n.total} 二级类目`}
                </span>
              </div>

              {/* 大类层 (flat 品牌: 类目竖向单列排列, 每行一项) */}
              {isOpen && info.flat && (
                <div style={{ borderTop: `1px solid ${C.line}` }}>
                  {info.groups[0].cats.map((c, ci) => {
                    const s = SHELF_ST[c.st];
                    return (
                      <div key={ci} style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 16px 11px 34px", borderTop: ci ? `1px solid ${C.line}` : "none" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
                        <span style={{ fontSize: 13, color: C.ink }}>{c.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {isOpen && !info.flat && (
                <div style={{ borderTop: `1px solid ${C.line}` }}>
                  {info.groups.map((g, gi) => {
                    const gkey = `${b}|${gi}`;
                    const gOpen = !!openG[gkey];
                    const gn = { selling: 0, ready: 0, idle: 0, skip: 0 };
                    g.cats.forEach(c => gn[c.st]++);
                    return (
                      <div key={gi} style={{ borderTop: gi ? `1px solid ${C.line}` : "none" }}>
                        <div onClick={() => setOpenG(s => ({ ...s, [gkey]: !s[gkey] }))}
                          style={{ display: "flex", alignItems: "center", gap: 9, padding: "11px 16px 11px 34px", cursor: "pointer", background: C.panel2 }}>
                          <Caret open={gOpen} small />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</span>
                          <span style={{ marginLeft: "auto", fontSize: 11, color: C.faint }}>{g.cats.length} 项</span>
                        </div>
                        {/* 类目层 (竖向单列, 可点开看 产品/供应商) */}
                        {gOpen && (
                          g.cats.length ? (
                            <div>
                              {g.cats.map((c, ci) => {
                                const s = SHELF_ST[c.st];
                                if (c.st === "skip") {
                                  return (
                                    <div key={ci} style={{ display: "flex", alignItems: "center", padding: "10px 16px 10px 58px", borderTop: `1px solid ${C.line}` }}>
                                      <span style={{ fontSize: 13, color: C.faint }}>{c.name} - 不做</span>
                                    </div>
                                  );
                                }
                                const ckey = `${gkey}|${ci}`;
                                const cOpen = !!openC[ckey];
                                const detail = catDetail(c.name, g.name);
                                return (
                                  <div key={ci} style={{ borderTop: `1px solid ${C.line}` }}>
                                    <div onClick={() => setOpenC(st => ({ ...st, [ckey]: !st[ckey] }))}
                                      style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 16px 10px 58px", cursor: "pointer" }}>
                                      <Caret open={cOpen} small />
                                      <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
                                      <span style={{ fontSize: 13, color: C.ink }}>{c.name}</span>
                                      {c.chatName && (
                                        <span onClick={(e) => { e.stopPropagation(); setProjectFor({ name: c.name, path: `${g.name} › ${c.name}`, chatName: c.chatName }); }}
                                          style={{ fontSize: 11, color: C.brand, cursor: "pointer", marginLeft: 6 }}>
                                          · 进入分析 →
                                        </span>
                                      )}
                                      {(() => {
                                        const prods = detail ? (detail.leaves ? detail.leaves.flatMap(l => l.products) : (detail.products || [])) : [];
                                        const leaves = detail && detail.leaves ? detail.leaves : [];
                                        const researchLeaves = leaves.filter(l => l.st === "idle" && (!l.products || !l.products.length)).length;
                                        const doneSkipLeaves = leaves.filter(l => l.st === "researched_skip").length;
                                        const sell = prods.filter(p => p.st === "selling").length;
                                        const res = prods.filter(p => p.st === "idle").length + researchLeaves;
                                        if (!prods.length && !researchLeaves && !doneSkipLeaves) return null;
                                        const cur = filterC[ckey];
                                        const toggle = (v, e) => { e.stopPropagation(); setFilterC(st => ({ ...st, [ckey]: st[ckey] === v ? undefined : v })); if (!openC[ckey]) setOpenC(st => ({ ...st, [ckey]: true })); };
                                        const chip = (active, color) => ({ cursor: "pointer", padding: "1px 7px", borderRadius: 10, border: `1px solid ${active ? color : "transparent"}`, background: active ? `${color}22` : "transparent", color });
                                        return (
                                          <span style={{ marginLeft: "auto", fontSize: 11, display: "flex", gap: 4 }}>
                                            <span onClick={(e) => toggle("selling", e)} style={chip(cur === "selling", SHELF_ST.selling.color)}>在售 {sell}</span>
                                            <span onClick={(e) => toggle("idle", e)} style={chip(cur === "idle", C.sub)}>在调研 {res}</span>
                                            <span onClick={(e) => toggle("researched_skip", e)} style={chip(cur === "researched_skip", C.faint)}>已调研不做 {doneSkipLeaves}</span>
                                          </span>
                                        );
                                      })()}
                                    </div>
                                    {cOpen && (
                                      <div style={{ background: C.bg, borderTop: `1px solid ${C.line}` }}>
                                        {detail && detail.leaves ? (
                                          detail.leaves.filter(lf => {
                                            const f = filterC[ckey];
                                            if (!f) return true;
                                            if (f === "selling") return lf.products.some(p => p.st === "selling");
                                            if (f === "researched_skip") return lf.st === "researched_skip";
                                            return (lf.st === "idle" && (!lf.products || !lf.products.length)) || lf.products.some(p => p.st === "idle");
                                          }).map((lf, li) => {
                                            const f = filterC[ckey];
                                            const shownProducts = f === "selling" ? lf.products.filter(p => p.st === "selling")
                                              : f === "idle" ? lf.products.filter(p => p.st === "idle") : lf.products;
                                            const lkey = `${ckey}|${li}`;
                                            const lOpen = !!openL[lkey];
                                            const leafDot = lf.products.some(p => p.st === "selling") ? SHELF_ST.selling.color : (lf.st === "idle" || !lf.products.length ? C.sub : SHELF_ST.selling.color);
                                            return (
                                              <div key={li} style={{ borderTop: li ? `1px solid ${C.line}` : "none" }}>
                                                {/* 末端类目行 */}
                                                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 16px 10px 82px" }}>
                                                  <span onClick={() => setOpenL(st => ({ ...st, [lkey]: !st[lkey] }))} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 9 }}>
                                                    <Caret open={lOpen} small />
                                                    <span style={{ width: 8, height: 8, borderRadius: 2, background: leafDot }} />
                                                  </span>
                                                  <span onClick={() => setProjectFor({ name: lf.leaf, path: lf.path, chatName: lf.chatName })} style={{ fontSize: 13, color: C.ink, fontWeight: 600, cursor: "pointer", textDecoration: "underline dotted", textDecorationColor: C.faint, textUnderlineOffset: 3 }}>
                                                    {lf.leaf}
                                                  </span>
                                                  {lf.st === "idle" && (!lf.products || !lf.products.length) && (
                                                    <span style={{ fontSize: 11, color: C.faint }}>· 在调研</span>
                                                  )}
                                                  {lf.st === "researched_skip" && (
                                                    <span style={{ fontSize: 11, color: C.faint }}>· 已调研不做</span>
                                                  )}
                                                  <span style={{ marginLeft: "auto", fontSize: 11, color: C.brand, cursor: "pointer" }}
                                                    onClick={() => setProjectFor({ name: lf.leaf, path: lf.path, chatName: lf.chatName })}>
                                                    进入分析 →
                                                  </span>
                                                </div>
                                                <div style={{ fontSize: 11, color: C.faint, padding: "0 16px 8px 116px" }}>{lf.path}</div>
                                                {/* 末端点开后显示 产品 / 供应商 */}
                                                {lOpen && (
                                                  <div style={{ padding: "4px 16px 14px 116px", background: C.panel }}>
                                                    <Branch title="产品">
                                                      {shownProducts.length ? shownProducts.map((p, pi) => (
                                                        <div key={pi} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", color: C.ink }}>
                                                          <span style={{ width: 6, height: 6, borderRadius: 2, background: SHELF_ST[p.st].color }} />{p.name}
                                                          <span style={{ color: C.faint, fontSize: 11 }}>· {SHELF_ST[p.st].label}</span>
                                                          {p.asin && (
                                                            <a href={`https://amazon.fr/dp/${p.asin}`} target="_blank" rel="noreferrer"
                                                              onClick={(e) => e.stopPropagation()}
                                                              style={{ color: C.brand, fontSize: 11, textDecoration: "none" }}>
                                                              · {p.asin}
                                                            </a>
                                                          )}
                                                        </div>
                                                      )) : <Empty t="暂无产品" />}
                                                    </Branch>
                                                    <Branch title="供应商">
                                                      {lf.suppliers.length ? lf.suppliers.map((sp, si) => (
                                                        <div key={si} style={{ fontSize: 12, padding: "5px 0", lineHeight: 1.6 }}>
                                                          <span style={{ color: C.ink, fontWeight: 600 }}>{sp.factory}</span>
                                                          <span style={{ color: C.sub }}> · {sp.contact}</span>
                                                          <div style={{ color: C.faint, fontSize: 11 }}>主要产品：{sp.products}</div>
                                                        </div>
                                                      )) : <Empty t="暂无供应商" />}
                                                    </Branch>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <div style={{ padding: "10px 16px 14px 82px" }}>
                                            <Branch title="产品">
                                              {detail && detail.products.length ? detail.products.map((p, pi) => (
                                                <div key={pi} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", color: C.ink }}>
                                                  <span style={{ width: 6, height: 6, borderRadius: 2, background: SHELF_ST[p.st].color }} />{p.name}
                                                  <span style={{ color: C.faint, fontSize: 11 }}>· {SHELF_ST[p.st].label}</span>
                                                </div>
                                              )) : <Empty t="暂无产品" />}
                                            </Branch>
                                            <Branch title="供应商">
                                              {detail && detail.suppliers.length ? detail.suppliers.map((sp, si) => (
                                                <div key={si} style={{ fontSize: 12, padding: "5px 0", lineHeight: 1.6 }}>
                                                  <span style={{ color: C.ink, fontWeight: 600 }}>{sp.factory}</span>
                                                  <span style={{ color: C.sub }}> · {sp.contact}</span>
                                                  <div style={{ color: C.faint, fontSize: 11 }}>主要产品：{sp.products}</div>
                                                </div>
                                              )) : <Empty t="暂无供应商" />}
                                            </Branch>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: C.faint, padding: "10px 16px 14px 58px", borderTop: `1px solid ${C.line}` }}>待录入</div>
                          )
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 跳转持续分析(Project) 弹窗 */}
      {projectFor && (
        <div onClick={() => setProjectFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 24, width: 460 }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>持续分析 · 类目 Project</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{projectFor.name}</div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 18 }}>{projectFor.path}</div>
            {projectFor.chatName ? (
              <div style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: 14, marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>当前对应 · Claude Code 对话</div>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{projectFor.chatName}</div>
                <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>
                  这个类目当前在 Claude Code 里跟踪。请在终端 <code style={{ background: C.panel2, padding: "1px 5px", borderRadius: 3, color: C.brand }}>claude</code> 里恢复此对话继续。<br />
                  将来迁到 Claude 网页版 Project 后，这里会变成可点跳转链接。
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.7, marginBottom: 18 }}>
                尚未关联持续分析对话。将来这里可以关联一个 Claude 网页版 Project，做持续的市场跟踪、竞品分析、供应商沟通记录，团队共享。
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setProjectFor(null)}
                style={{ flex: 1, padding: "9px", background: C.brand, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Caret({ open, small }) {
  return <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", color: C.sub, fontSize: small ? 10 : 12, width: 12 }}>▶</span>;
}
function Branch({ title, children }) {
  return (
    <div style={{ marginTop: 8, borderLeft: `2px solid ${C.line}`, paddingLeft: 12 }}>
      <div style={{ fontSize: 11, color: C.sub, fontWeight: 700, letterSpacing: ".04em", marginBottom: 2 }}>{title}</div>
      {children}
    </div>
  );
}
function Empty({ t }) {
  return <div style={{ fontSize: 12, color: C.faint, padding: "4px 0" }}>{t}</div>;
}

// ---------- small bits ----------
function SectionTitle({ t, sub }) {
  return <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 14, fontWeight: 700 }}>{t}</div>
    {sub && <div style={{ fontSize: 12, color: C.sub, marginTop: 3 }}>{sub}</div>}
  </div>;
}
function Pill({ color, text }) {
  return <span style={{ fontSize: 11, color, border: `1px solid ${color}55`, background: `${color}18`, padding: "2px 8px", borderRadius: 20 }}>{text}</span>;
}
function Stat({ label, value, accent }) {
  return <div>
    <div style={{ fontSize: 11, color: C.sub }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: accent || C.ink, marginTop: 2 }}>{value}</div>
  </div>;
}
const btn = (C) => ({ marginTop: 12, width: "100%", padding: "8px", background: "transparent", border: `1px solid ${C.line}`, color: C.sub, borderRadius: 8, fontSize: 12, cursor: "pointer" });
