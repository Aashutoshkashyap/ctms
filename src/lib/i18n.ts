export const LANGUAGES = ['ne', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export type TranslationKey = keyof typeof translations.ne;

const STORAGE_KEY = 'buildtrack_language';

const translations = {
  ne: {
    'language.ne': 'नेपाली', 'language.en': 'English', 'common.back': 'ड्यासबोर्डमा फर्कनुहोस्',
    'common.save': 'सुरक्षित गर्नुहोस्', 'common.cancel': 'रद्द गर्नुहोस्', 'common.submit': 'पेश गर्नुहोस्',
    'common.edit': 'सम्पादन', 'common.delete': 'हटाउनुहोस्', 'common.close': 'बन्द गर्नुहोस्',
    'common.loading': 'लोड हुँदैछ…', 'common.retry': 'फेरि प्रयास गर्नुहोस्', 'common.search': 'खोज्नुहोस्',
    'common.filter': 'छान्नुहोस्', 'common.noData': 'रेकर्ड उपलब्ध छैन।', 'common.accessDenied': 'यो कार्यस्थान तपाईंको भूमिकाका लागि उपलब्ध छैन',
    'common.noConnection': 'इन्टरनेट जडान छैन — तपाईंले भरेको विवरण यहीँ सुरक्षित छ।', 'common.saving': 'सुरक्षित हुँदैछ…', 'common.saveFailed': 'सुरक्षित हुन सकेन। जडान जाँच गरी फेरि प्रयास गर्नुहोस्।',
    'shell.myWorkspace': 'मेरो कार्यस्थान', 'shell.mySiteWork': 'मेरो साइट काम', 'shell.projectDelivery': 'परियोजना कार्यान्वयन', 'shell.projectOversight': 'परियोजना निरीक्षण',
    'shell.additionalTools': 'अनुमति प्राप्त अन्य उपकरणहरू', 'shell.projectContext': 'परियोजना', 'shell.role': 'भूमिका',
    'nav.dashboard': 'मेरो ड्यासबोर्ड', 'nav.schedule': 'बीओक्यू र कार्य तालिका', 'nav.daily': 'दैनिक साइट प्रतिवेदन', 'nav.operations': 'स्रोत र उत्पादकत्व',
    'nav.expenses': 'दैनिक खर्च दर्ता', 'nav.documents': 'अनुपालन र कागजात', 'nav.reports': 'प्रतिवेदन र निर्यात', 'nav.settings': 'प्रणाली सेटिङ',
    'home.next': 'अब के गर्नु आवश्यक छ?', 'home.workspace': 'तपाईंको कार्यस्थान', 'home.authorized': 'तपाईंको भूमिकाका लागि अनुमति भएका उपकरण मात्र देखाइएका छन्।',
    'daily.title': 'दैनिक साइट प्रतिवेदन', 'daily.new': '+ नयाँ दैनिक प्रतिवेदन', 'daily.today': 'आजको काम पेश गर्नुहोस्', 'daily.more': 'थप विवरण (ऐच्छिक)',
    'daily.saved': 'कामको अद्यावधिक सुरक्षित भयो।', 'daily.mySubmissions': 'मेरो पेश गरिएका कामहरू', 'daily.problem': 'समस्या छ?', 'daily.noProblem': 'समस्या छैन', 'daily.yesProblem': 'समस्या छ', 'daily.quantity': 'परिमाण', 'daily.work': 'बीओक्यू काम',
    'action.people': 'मानिस र पहुँच व्यवस्थापन', 'action.projects': 'परियोजना व्यवस्थापन', 'action.plan': 'कार्य योजना समीक्षा', 'action.progress': 'कार्य प्रगति समीक्षा', 'action.schedule': 'तालिका अद्यावधिक',
    'action.commercial': 'व्यावसायिक काम समीक्षा', 'action.expenses': 'दैनिक खर्च समीक्षा', 'action.ipc': 'आईपीसी / मूल्याङ्कन समीक्षा', 'action.stock': 'भण्डार र स्टक अद्यावधिक',
    'action.quality': 'गुणस्तर निरीक्षण दर्ता', 'action.safety': 'सुरक्षा निरीक्षण दर्ता', 'action.design': 'डिजाइन समीक्षा', 'action.report': 'दैनिक प्रगति पेश गर्नुहोस्',
    'director.attention': 'निर्देशकको ध्यान आवश्यक', 'director.delays': 'ढिलाइ भएको काम समीक्षा', 'director.costs': 'खर्च समीक्षा', 'director.reports': 'परियोजना प्रतिवेदन हेर्नुहोस्',
    'director.openSchedule': 'ढिलाइ भएका गतिविधि र कार्यतालिका खोल्नुहोस्।', 'director.openCosts': 'दर्ता भएका खर्च र स्वीकृति खोल्नुहोस्।', 'director.openReports': 'हालको परियोजनाको प्रतिवेदन केन्द्र खोल्नुहोस्।',
  },
  en: {
    'language.ne': 'Nepali', 'language.en': 'English', 'common.back': 'Back to dashboard',
    'common.save': 'Save', 'common.cancel': 'Cancel', 'common.submit': 'Submit', 'common.edit': 'Edit',
    'common.delete': 'Delete', 'common.close': 'Close', 'common.loading': 'Loading…', 'common.retry': 'Retry',
    'common.search': 'Search', 'common.filter': 'Filter', 'common.noData': 'No records available.', 'common.accessDenied': 'This workspace is not available for your role',
    'common.noConnection': 'No connection — your entered details are still here.', 'common.saving': 'Saving…', 'common.saveFailed': 'Save failed. Check your connection and retry.',
    'shell.myWorkspace': 'My workspace', 'shell.mySiteWork': 'My site work', 'shell.projectDelivery': 'Project delivery', 'shell.projectOversight': 'Project oversight',
    'shell.additionalTools': 'Additional authorised tools', 'shell.projectContext': 'Project', 'shell.role': 'Role',
    'nav.dashboard': 'My dashboard', 'nav.schedule': 'BOQ & work schedule', 'nav.daily': 'Daily site reporting', 'nav.operations': 'Resources & productivity',
    'nav.expenses': 'Daily expense register', 'nav.documents': 'Compliance & documents', 'nav.reports': 'Reports & exports', 'nav.settings': 'System settings',
    'home.next': 'What do you need to do now?', 'home.workspace': 'Your workspace', 'home.authorized': 'Only modules authorised for this role are shown.',
    'daily.title': 'Daily site reporting', 'daily.new': '+ New daily report', 'daily.today': "Submit today’s work", 'daily.more': 'More details (optional)',
    'daily.saved': 'Your work update was saved.', 'daily.mySubmissions': 'My submissions', 'daily.problem': 'Problem?', 'daily.noProblem': 'No problem', 'daily.yesProblem': 'Yes, there is a problem', 'daily.quantity': 'Quantity', 'daily.work': 'BOQ work',
    'action.people': 'Manage people and access', 'action.projects': 'Manage projects', 'action.plan': 'Review work plan', 'action.progress': 'Review work progress', 'action.schedule': 'Update schedule',
    'action.commercial': 'Review commercial work', 'action.expenses': 'Review daily expenses', 'action.ipc': 'Review IPC / valuation', 'action.stock': 'Update stores and stock',
    'action.quality': 'Record a quality inspection', 'action.safety': 'Record a safety inspection', 'action.design': 'Review design records', 'action.report': 'Submit daily progress',
    'director.attention': 'Director attention', 'director.delays': 'Review delayed work', 'director.costs': 'Review costs', 'director.reports': 'View project reports',
    'director.openSchedule': 'Open delayed activities and the schedule.', 'director.openCosts': 'Open logged costs and approvals.', 'director.openReports': 'Open the current project reporting centre.',
  },
} as const;

export function readLanguage(): Language {
  if (typeof window === 'undefined') return 'ne';
  const value = window.localStorage.getItem(STORAGE_KEY);
  return LANGUAGES.includes(value as Language) ? value as Language : 'ne';
}

export function persistLanguage(language: Language) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, language);
}

export function t(language: Language, key: TranslationKey): string {
  return translations[language][key] || translations.en[key] || key;
}
