const PHASES = [
  {
    id: "phase1",
    badge: "Фаза 1 · 1–2 недели",
    title: "Основы и базовая среда",
    tasks: [
      { id: "p1t1", text: "Прочитать о философии Docs as Code (Anne Gentle, Write the Docs)" },
      { id: "p1t2", text: "Изучить Markdown, CommonMark, GitHub Flavored Markdown" },
      { id: "p1t3", text: "Познакомиться с AsciiDoc и reStructuredText" },
      { id: "p1t4", text: "Освоить основы Git: коммиты, ветки, merge, rebase" },
      { id: "p1t5", text: "Установить VS Code и расширения (Markdown All in One, markdownlint, Prettier, GitLens, Code Spell Checker, Mermaid Preview)" },
      { id: "p1t6", text: "Установить Git локально, создать аккаунт GitHub/GitLab" },
      { id: "p1t7", text: "Создать репозиторий docs-sandbox с первой документацией" },
      { id: "p1t8", text: "Практика: 3–5 страниц документации со структурой каталогов" }
    ]
  },
  {
    id: "phase2",
    badge: "Фаза 2 · 2 недели",
    title: "Генераторы статических сайтов",
    tasks: [
      { id: "p2t1", text: "Изучить варианты: MkDocs, Docusaurus, Antora, Sphinx, Hugo" },
      { id: "p2t2", text: "Выбрать основной генератор (рекомендуется MkDocs Material)" },
      { id: "p2t3", text: "Установить и настроить mkdocs.yml: навигация, поиск, темизация" },
      { id: "p2t4", text: "Настроить версионирование (например, через mike)" },
      { id: "p2t5", text: "Подключить Mermaid для диаграмм" },
      { id: "p2t6", text: "Подключить PlantUML для UML-диаграмм" },
      { id: "p2t7", text: "Подключить MathJax для формул (если нужно)" },
      { id: "p2t8", text: "Опционально: попробовать Docusaurus или Sphinx для сравнения" }
    ]
  },
  {
    id: "phase3",
    badge: "Фаза 3 · 1–2 недели",
    title: "Качество и автоматизация локально",
    tasks: [
      { id: "p3t1", text: "Установить и настроить markdownlint-cli2" },
      { id: "p3t2", text: "Настроить Vale с готовым набором правил (Google/Microsoft)" },
      { id: "p3t3", text: "Подключить LanguageTool для русского языка" },
      { id: "p3t4", text: "Настроить lychee или markdown-link-check для проверки ссылок" },
      { id: "p3t5", text: "Добавить codespell для проверки опечаток" },
      { id: "p3t6", text: "Установить pre-commit, создать .pre-commit-config.yaml" },
      { id: "p3t7", text: "Написать собственный STYLEGUIDE.md для проекта" },
      { id: "p3t8", text: "Изучить Microsoft и Google Developer Documentation Style Guide" }
    ]
  },
  {
    id: "phase4",
    badge: "Фаза 4 · 1–2 недели",
    title: "CI/CD и публикация",
    tasks: [
      { id: "p4t1", text: "Изучить синтаксис GitHub Actions или GitLab CI" },
      { id: "p4t2", text: "Освоить Conventional Commits и автогенерацию changelog" },
      { id: "p4t3", text: "Настроить workflow: линтеры на push в feature-ветки" },
      { id: "p4t4", text: "Настроить preview-сборки на pull request (Netlify/Cloudflare)" },
      { id: "p4t5", text: "Настроить автодеплой при merge в main" },
      { id: "p4t6", text: "Выбрать и настроить хостинг (GitHub Pages / Cloudflare Pages / Read the Docs)" },
      { id: "p4t7", text: "Проверить полный цикл: коммит → PR → деплой" }
    ]
  },
  {
    id: "phase5",
    badge: "Фаза 5 · 2 недели",
    title: "Экспорт и оформление по требованиям заказчика",
    tasks: [
      { id: "p5t1", text: "Установить Pandoc и освоить базовые конвертации: Markdown → DOCX, PDF, HTML" },
      { id: "p5t2", text: "Изучить шаблоны DOCX в Pandoc (--reference-doc) для корпоративного оформления" },
      { id: "p5t3", text: "Настроить генерацию PDF через XeLaTeX с поддержкой кириллицы (или LuaLaTeX)" },
      { id: "p5t4", text: "Опционально: попробовать Typst как современную альтернативу LaTeX" },
      { id: "p5t5", text: "Изучить требования ГОСТ к технической документации (ГОСТ 19, ГОСТ 34, ГОСТ 7.32)" },
      { id: "p5t6", text: "Создать DOCX-шаблон с титульным листом, оглавлением, колонтитулами по ГОСТ" },
      { id: "p5t7", text: "Настроить параметризацию через YAML front matter (заказчик, версия, гриф)" },
      { id: "p5t8", text: "Добавить в CI/CD сборку DOCX/PDF артефактов наряду с HTML-сайтом" },
      { id: "p5t9", text: "Освоить docxtemplater или python-docx для сложных программных шаблонов" },
      { id: "p5t10", text: "Опционально: Asciidoctor PDF как альтернатива для AsciiDoc-проектов" }
    ]
  },
  {
    id: "phase6",
    badge: "Фаза 6 · 2–3 недели",
    title: "Продвинутые практики",
    tasks: [
      { id: "p6t1", text: "Изучить Diátaxis framework (diataxis.fr)" },
      { id: "p6t2", text: "Реструктурировать docs-sandbox по Diátaxis: tutorials/how-to/reference/explanation" },
      { id: "p6t3", text: "Настроить генерацию API-документации из OpenAPI (Redoc или Scalar)" },
      { id: "p6t4", text: "Освоить версионирование документации для нескольких версий продукта" },
      { id: "p6t5", text: "Попробовать локализацию (Crowdin/Weblate или i18n)" },
      { id: "p6t6", text: "Освоить Diagram as Code: Mermaid, PlantUML, D2, Structurizr" },
      { id: "p6t7", text: "Настроить скриншоты as Code через Playwright" },
      { id: "p6t8", text: "Сделать тестируемые примеры кода (doctest или аналог)" }
    ]
  },
  {
    id: "phase7",
    badge: "Фаза 7 · 2 недели",
    title: "ИИ в контуре документации",
    tasks: [
      { id: "p7t1", text: "Установить Claude Code или расширение Continue в VS Code" },
      { id: "p7t2", text: "Опробовать ИИ для генерации черновиков и рефакторинга текста" },
      { id: "p7t3", text: "Опционально: попробовать локальные модели через Ollama" },
      { id: "p7t4", text: "Получить API-ключ Anthropic Claude (или альтернативы)" },
      { id: "p7t5", text: "Написать CI-скрипт: ИИ-ревью документации на pull request" },
      { id: "p7t6", text: "Настроить ИИ-редактуру: проверка стиля, тона, соответствия стайлгайду и ГОСТ" },
      { id: "p7t7", text: "Настроить автогенерацию release notes из коммитов" },
      { id: "p7t8", text: "Опробовать автоматический перевод изменённых страниц" },
      { id: "p7t9", text: "Настроить ИИ-разбор требований заказчика → структура документации" },
      { id: "p7t10", text: "Автогенерация задач и чек-листов из текста ТЗ через ИИ" },
      { id: "p7t11", text: "Применить промпт-кэширование для снижения стоимости API" },
      { id: "p7t12", text: "Создать набор многоразовых промптов для типовых документов" }
    ]
  }
];
