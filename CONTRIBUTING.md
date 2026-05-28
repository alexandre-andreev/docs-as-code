# Правила вклада в проект

## Conventional Commits

Все коммиты в репозитории оформляются по стандарту
[Conventional Commits](https://www.conventionalcommits.org/ru/).
Это позволяет автоматически генерировать changelog и видеть историю по типу изменений.

### Формат

```
<тип>(<область>): <краткое описание>

[опциональное тело]

[опциональные сноски]
```

### Типы коммитов

| Тип        | Когда использовать                                        |
|------------|-----------------------------------------------------------|
| `feat`     | Новая задача, фаза или функциональность трекера           |
| `fix`      | Исправление ошибки в логике или данных                    |
| `docs`     | Изменения в README, CONTRIBUTING или других документах    |
| `style`    | Форматирование CSS, отступы — без изменения поведения     |
| `refactor` | Рефакторинг кода без изменения функциональности           |
| `chore`    | Обновление конфигов, зависимостей, workflow               |
| `ci`       | Изменения в GitHub Actions и настройках деплоя            |

### Примеры для этого репозитория

```bash
# Добавить новую фазу обучения
git commit -m "feat(data): add phase 8 — technical writing for open source"

# Исправить опечатку в тексте задачи
git commit -m "fix(data): fix typo in phase3 task description"

# Обновить README
git commit -m "docs(readme): add local dev server instructions"

# Исправить CSS-баг на мобильных
git commit -m "fix(styles): fix task actions overflow on small screens"

# Добавить новую функцию в приложение
git commit -m "feat(app): add progress sync via GitHub Gist API"

# Обновить workflow деплоя
git commit -m "ci(deploy): upgrade actions/upload-pages-artifact to v4"

# Изменение сразу нескольких областей без конкретной области
git commit -m "refactor: split single HTML into index, styles, app, data"
```

### Breaking changes

Если изменение нарушает обратную совместимость (например, меняется формат JSON-экспорта),
добавьте `!` после типа и опишите в сноске:

```bash
git commit -m "feat(data)!: rename phase IDs to semantic slugs

BREAKING CHANGE: phase IDs changed from phase1..7 to slug format.
Existing exported JSON files will need re-import."
```

## Рабочий процесс

1. Создайте ветку от `main`:
   ```bash
   git checkout -b feat/gist-sync
   ```

2. Внесите изменения, сделайте коммиты по Conventional Commits.

3. Отправьте ветку и откройте Pull Request в `main`.

4. После merge — GitHub Actions автоматически задеплоит изменения на GitHub Pages.

## Что редактировать

- **Задачи и фазы** — только в `data.js`, одно место
- **Логика и поведение** — в `app.js`
- **Внешний вид** — в `styles.css`
- **Разметка страницы** — в `index.html`
- **Документация** — в `README.md` и `CONTRIBUTING.md`
