/**
 * PF2E Front Manager
 * Verwalte Kampagnen-Fronten, Dangers, Secrets und Grim Portents
 * mit bidirektionaler Synchronisation zum MCP-Server.
 */

const MODULE_ID = 'front-manager';
const API_BASE = 'http://localhost:3000';

// ============================================================================
// ApplicationV2 - Front Manager Window
// ============================================================================

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class FrontManagerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  // Singleton instance
  static #instance = null;

  static get instance() {
    return this.#instance;
  }

  static DEFAULT_OPTIONS = {
    id: 'front-manager',
    classes: ['front-manager'],
    window: {
      title: 'Front Manager',
      icon: 'fas fa-scroll',
      resizable: true
    },
    position: {
      width: 700,
      height: 800
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/front-manager.hbs`
    }
  };

  // State
  #frontsData = null;
  #expandedFronts = new Set();
  #expandedDangers = new Set();
  #loading = false;
  #error = null;
  #scrollPosition = 0;

  constructor(options = {}) {
    super(options);
    FrontManagerApp.#instance = this;
  }

  // -------------------------------------------------------------------------
  // Data Preparation
  // -------------------------------------------------------------------------

  async _prepareContext(options) {
    // If we don't have data yet, fetch it
    if (!this.#frontsData && !this.#loading) {
      await this.#fetchFronts();
    }

    // Prepare fronts with expanded state
    const fronts = (this.#frontsData?.fronts || []).map(front => ({
      ...front,
      expanded: this.#expandedFronts.has(front.id),
      dangers: front.dangers.map(danger => ({
        ...danger,
        expanded: this.#expandedDangers.has(danger.id)
      }))
    }));

    return {
      fronts,
      loading: this.#loading,
      error: this.#error
    };
  }

  // -------------------------------------------------------------------------
  // API Communication
  // -------------------------------------------------------------------------

  async #fetchFronts() {
    this.#loading = true;
    this.#error = null;

    try {
      const response = await fetch(`${API_BASE}/api/fronts`);
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      this.#frontsData = await response.json();
      console.log(`[FrontManager] Loaded ${this.#frontsData.fronts?.length || 0} fronts`);
    } catch (err) {
      console.error('[FrontManager] Failed to fetch fronts:', err);
      this.#error = `Verbindung zum Server fehlgeschlagen: ${err.message}`;
    } finally {
      this.#loading = false;
    }
  }

  async #saveFronts() {
    try {
      const response = await fetch(`${API_BASE}/api/fronts/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fronts: this.#frontsData.fronts })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      console.log('[FrontManager] Fronts saved successfully');
      return true;
    } catch (err) {
      console.error('[FrontManager] Failed to save fronts:', err);
      ui.notifications.error(`Fehler beim Speichern: ${err.message}`);
      return false;
    }
  }

  async #toggleSecret(dangerId, secretId) {
    try {
      const response = await fetch(`${API_BASE}/api/fronts/secret/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dangerId, secretId })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[FrontManager] Secret toggled:', result);

      // Refresh data
      await this.#fetchFronts();
      this.render();

      // Show notification
      const secret = result.secret;
      if (secret.revealed) {
        ui.notifications.info(`Secret gelüftet: ${secret.text.substring(0, 50)}...`);
      } else {
        ui.notifications.info(`Secret zurückgesetzt`);
      }
    } catch (err) {
      console.error('[FrontManager] Failed to toggle secret:', err);
      ui.notifications.error(`Fehler: ${err.message}`);
    }
  }

  async #togglePortent(dangerId, portentId) {
    try {
      const response = await fetch(`${API_BASE}/api/fronts/portent/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dangerId, portentId })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log('[FrontManager] Portent toggled:', result);

      // Refresh data
      await this.#fetchFronts();
      this.render();

    } catch (err) {
      console.error('[FrontManager] Failed to toggle portent:', err);
      ui.notifications.error(`Fehler: ${err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  #getFront(frontId) {
    return this.#frontsData?.fronts?.find(f => f.id === frontId);
  }

  #getDanger(dangerId) {
    for (const front of this.#frontsData?.fronts || []) {
      const danger = front.dangers.find(d => d.id === dangerId);
      if (danger) return { front, danger };
    }
    return null;
  }

  #generateId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // -------------------------------------------------------------------------
  // Lifecycle Hooks - Scroll Position Preservation
  // -------------------------------------------------------------------------

  _preRender(context, options) {
    // Save scroll position before re-render
    const container = this.element?.querySelector('.front-manager-container');
    if (container) {
      this.#scrollPosition = container.scrollTop;
    }
    return super._preRender(context, options);
  }

  // -------------------------------------------------------------------------
  // Event Handling
  // -------------------------------------------------------------------------

  _onRender(context, options) {
    const html = this.element;

    // Restore scroll position after render
    const container = html.querySelector('.front-manager-container');
    if (container && this.#scrollPosition > 0) {
      requestAnimationFrame(() => {
        container.scrollTop = this.#scrollPosition;
      });
    }

    // Toggle front expand/collapse
    html.querySelectorAll('[data-action="toggle-front"]').forEach(el => {
      el.addEventListener('click', ev => {
        // Don't toggle if clicking on edit button
        if (ev.target.closest('.icon-btn')) return;

        const frontItem = ev.currentTarget.closest('.front-item');
        const frontId = frontItem.dataset.frontId;

        if (this.#expandedFronts.has(frontId)) {
          this.#expandedFronts.delete(frontId);
        } else {
          this.#expandedFronts.add(frontId);
        }
        this.render();
      });
    });

    // Toggle danger expand/collapse
    html.querySelectorAll('[data-action="toggle-danger"]').forEach(el => {
      el.addEventListener('click', ev => {
        const dangerId = ev.currentTarget.dataset.dangerId;

        if (this.#expandedDangers.has(dangerId)) {
          this.#expandedDangers.delete(dangerId);
        } else {
          this.#expandedDangers.add(dangerId);
        }
        this.render();
      });
    });

    // Toggle secret
    html.querySelectorAll('[data-action="toggle-secret"]').forEach(el => {
      el.addEventListener('change', ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        const secretId = ev.currentTarget.dataset.secretId;
        this.#toggleSecret(dangerId, secretId);
      });
    });

    // Toggle portent
    html.querySelectorAll('[data-action="toggle-portent"]').forEach(el => {
      el.addEventListener('change', ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        const portentId = ev.currentTarget.dataset.portentId;
        this.#togglePortent(dangerId, portentId);
      });
    });

    // Refresh button
    html.querySelectorAll('[data-action="refresh"]').forEach(el => {
      el.addEventListener('click', async ev => {
        ev.preventDefault();
        this.#frontsData = null;
        await this.#fetchFronts();
        this.render();
        ui.notifications.info('Fronten aktualisiert');
      });
    });

    // =========================================================================
    // EDIT ACTIONS
    // =========================================================================

    // Add new front
    html.querySelectorAll('[data-action="add-front"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        this.#showAddFrontDialog();
      });
    });

    // Edit front name
    html.querySelectorAll('[data-action="edit-front-name"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const frontId = ev.currentTarget.dataset.frontId;
        this.#showEditTextDialog('Front Name', this.#getFront(frontId)?.name || '', async (newValue) => {
          const front = this.#getFront(frontId);
          if (front) {
            front.name = newValue;
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Add cast
    html.querySelectorAll('[data-action="add-cast"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const frontId = ev.currentTarget.dataset.frontId;
        this.#showEditTextDialog('Neuer Cast-Eintrag', '', async (newValue) => {
          const front = this.#getFront(frontId);
          if (front) {
            if (!front.cast) front.cast = [];
            front.cast.push(newValue);
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Edit cast
    html.querySelectorAll('[data-action="edit-cast"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const frontId = ev.currentTarget.dataset.frontId;
        const index = parseInt(ev.currentTarget.dataset.index);
        const front = this.#getFront(frontId);
        this.#showEditTextDialog('Cast bearbeiten', front?.cast?.[index] || '', async (newValue) => {
          if (front && front.cast) {
            front.cast[index] = newValue;
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Delete cast
    html.querySelectorAll('[data-action="delete-cast"]').forEach(el => {
      el.addEventListener('click', async ev => {
        ev.preventDefault();
        const frontId = ev.currentTarget.dataset.frontId;
        const index = parseInt(ev.currentTarget.dataset.index);
        const front = this.#getFront(frontId);
        if (front && front.cast) {
          front.cast.splice(index, 1);
          await this.#saveFronts();
          await this.#fetchFronts();
          this.render();
        }
      });
    });

    // Add stake
    html.querySelectorAll('[data-action="add-stake"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const frontId = ev.currentTarget.dataset.frontId;
        this.#showEditTextDialog('Neuer Stake', '', async (newValue) => {
          const front = this.#getFront(frontId);
          if (front) {
            if (!front.stakes) front.stakes = [];
            front.stakes.push(newValue);
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Edit stake
    html.querySelectorAll('[data-action="edit-stake"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const frontId = ev.currentTarget.dataset.frontId;
        const index = parseInt(ev.currentTarget.dataset.index);
        const front = this.#getFront(frontId);
        this.#showEditTextDialog('Stake bearbeiten', front?.stakes?.[index] || '', async (newValue) => {
          if (front && front.stakes) {
            front.stakes[index] = newValue;
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Delete stake
    html.querySelectorAll('[data-action="delete-stake"]').forEach(el => {
      el.addEventListener('click', async ev => {
        ev.preventDefault();
        const frontId = ev.currentTarget.dataset.frontId;
        const index = parseInt(ev.currentTarget.dataset.index);
        const front = this.#getFront(frontId);
        if (front && front.stakes) {
          front.stakes.splice(index, 1);
          await this.#saveFronts();
          await this.#fetchFronts();
          this.render();
        }
      });
    });

    // Add danger
    html.querySelectorAll('[data-action="add-danger"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const frontId = ev.currentTarget.dataset.frontId;
        this.#showAddDangerDialog(frontId);
      });
    });

    // Edit danger (full dialog)
    html.querySelectorAll('[data-action="edit-danger"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const dangerId = ev.currentTarget.dataset.dangerId;
        this.#showEditDangerDialog(dangerId);
      });
    });

    // Delete danger
    html.querySelectorAll('[data-action="delete-danger"]').forEach(el => {
      el.addEventListener('click', async ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const frontId = ev.currentTarget.dataset.frontId;
        const dangerId = ev.currentTarget.dataset.dangerId;

        const confirmed = await Dialog.confirm({
          title: 'Danger löschen',
          content: '<p>Diesen Danger wirklich löschen?</p>'
        });

        if (confirmed) {
          const front = this.#getFront(frontId);
          if (front) {
            front.dangers = front.dangers.filter(d => d.id !== dangerId);
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        }
      });
    });

    // Edit impulse
    html.querySelectorAll('[data-action="edit-impulse"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        const result = this.#getDanger(dangerId);
        this.#showEditTextDialog('Impulse bearbeiten', result?.danger?.impulse || '', async (newValue) => {
          if (result?.danger) {
            result.danger.impulse = newValue;
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Edit doom
    html.querySelectorAll('[data-action="edit-doom"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        const result = this.#getDanger(dangerId);
        this.#showEditTextDialog('Impending Doom bearbeiten', result?.danger?.impendingDoom || '', async (newValue) => {
          if (result?.danger) {
            result.danger.impendingDoom = newValue;
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Add portent
    html.querySelectorAll('[data-action="add-portent"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        this.#showEditTextDialog('Neues Grim Portent', '', async (newValue) => {
          const result = this.#getDanger(dangerId);
          if (result?.danger) {
            if (!result.danger.grimPortents) result.danger.grimPortents = [];
            result.danger.grimPortents.push({
              id: this.#generateId('portent'),
              text: newValue,
              completed: false
            });
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Edit portent
    html.querySelectorAll('[data-action="edit-portent"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        const portentId = ev.currentTarget.dataset.portentId;
        const result = this.#getDanger(dangerId);
        const portent = result?.danger?.grimPortents?.find(p => p.id === portentId);
        this.#showEditTextDialog('Portent bearbeiten', portent?.text || '', async (newValue) => {
          if (portent) {
            portent.text = newValue;
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Delete portent
    html.querySelectorAll('[data-action="delete-portent"]').forEach(el => {
      el.addEventListener('click', async ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        const portentId = ev.currentTarget.dataset.portentId;
        const result = this.#getDanger(dangerId);
        if (result?.danger?.grimPortents) {
          result.danger.grimPortents = result.danger.grimPortents.filter(p => p.id !== portentId);
          await this.#saveFronts();
          await this.#fetchFronts();
          this.render();
        }
      });
    });

    // Add secret
    html.querySelectorAll('[data-action="add-secret"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        this.#showAddSecretDialog(dangerId);
      });
    });

    // Edit secret
    html.querySelectorAll('[data-action="edit-secret"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        const secretId = ev.currentTarget.dataset.secretId;
        const result = this.#getDanger(dangerId);
        const secret = result?.danger?.secrets?.find(s => s.id === secretId);
        this.#showEditSecretDialog(dangerId, secret);
      });
    });

    // Delete secret
    html.querySelectorAll('[data-action="delete-secret"]').forEach(el => {
      el.addEventListener('click', async ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        const secretId = ev.currentTarget.dataset.secretId;
        const result = this.#getDanger(dangerId);
        if (result?.danger?.secrets) {
          result.danger.secrets = result.danger.secrets.filter(s => s.id !== secretId);
          await this.#saveFronts();
          await this.#fetchFronts();
          this.render();
        }
      });
    });

    // Add location
    html.querySelectorAll('[data-action="add-location"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        this.#showEditTextDialog('Neue Location', '', async (newValue) => {
          const result = this.#getDanger(dangerId);
          if (result?.danger) {
            if (!result.danger.locations) result.danger.locations = [];
            result.danger.locations.push(newValue);
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Edit location
    html.querySelectorAll('[data-action="edit-location"]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        const index = parseInt(ev.currentTarget.dataset.index);
        const result = this.#getDanger(dangerId);
        this.#showEditTextDialog('Location bearbeiten', result?.danger?.locations?.[index] || '', async (newValue) => {
          if (result?.danger?.locations) {
            result.danger.locations[index] = newValue;
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
          }
        });
      });
    });

    // Delete location
    html.querySelectorAll('[data-action="delete-location"]').forEach(el => {
      el.addEventListener('click', async ev => {
        ev.preventDefault();
        const dangerId = ev.currentTarget.dataset.dangerId;
        const index = parseInt(ev.currentTarget.dataset.index);
        const result = this.#getDanger(dangerId);
        if (result?.danger?.locations) {
          result.danger.locations.splice(index, 1);
          await this.#saveFronts();
          await this.#fetchFronts();
          this.render();
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // Dialogs
  // -------------------------------------------------------------------------

  #showEditTextDialog(title, currentValue, onSave) {
    new Dialog({
      title: title,
      content: `
        <form class="front-edit-dialog">
          <div class="form-group">
            <textarea name="value" rows="3">${currentValue}</textarea>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: 'Speichern',
          callback: async (html) => {
            const value = html.find('[name="value"]').val().trim();
            if (value) {
              await onSave(value);
              ui.notifications.info('Gespeichert');
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Abbrechen'
        }
      },
      default: 'save'
    }).render(true);
  }

  #showAddFrontDialog() {
    new Dialog({
      title: 'Neue Front erstellen',
      content: `
        <form class="front-edit-dialog">
          <div class="form-group">
            <label>Name</label>
            <input type="text" name="name" placeholder="Name der Front">
          </div>
          <div class="form-group">
            <label>Typ</label>
            <select name="type">
              <option value="campaign">Kampagnenfront</option>
              <option value="adventure">Adventure Front</option>
            </select>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: 'Erstellen',
          callback: async (html) => {
            const name = html.find('[name="name"]').val().trim();
            const type = html.find('[name="type"]').val();
            if (name) {
              const newFront = {
                id: this.#generateId('front'),
                name: name,
                type: type,
                cast: [],
                stakes: [],
                playerHooks: [],
                dangers: []
              };
              this.#frontsData.fronts.push(newFront);
              await this.#saveFronts();
              await this.#fetchFronts();
              this.#expandedFronts.add(newFront.id);
              this.render();
              ui.notifications.info(`Front "${name}" erstellt`);
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Abbrechen'
        }
      },
      default: 'save'
    }).render(true);
  }

  #showAddDangerDialog(frontId) {
    new Dialog({
      title: 'Neuen Danger erstellen',
      content: `
        <form class="front-edit-dialog">
          <div class="form-group">
            <label>Name</label>
            <input type="text" name="name" placeholder="Name des Dangers">
          </div>
          <div class="form-group">
            <label>Typ (z.B. "Ambitious Organizations", "Cursed Places")</label>
            <input type="text" name="dangerType" placeholder="Danger-Typ">
          </div>
          <div class="form-group">
            <label>Impulse</label>
            <input type="text" name="impulse" placeholder="to...">
          </div>
          <div class="form-group">
            <label>Impending Doom</label>
            <input type="text" name="doom" placeholder="Destruction, Usurpation, etc.">
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: 'Erstellen',
          callback: async (html) => {
            const name = html.find('[name="name"]').val().trim();
            const dangerType = html.find('[name="dangerType"]').val().trim();
            const impulse = html.find('[name="impulse"]').val().trim();
            const doom = html.find('[name="doom"]').val().trim();

            if (name) {
              const front = this.#getFront(frontId);
              if (front) {
                const newDanger = {
                  id: this.#generateId('danger'),
                  name: name,
                  dangerType: dangerType || 'Unknown',
                  impulse: impulse || 'to cause chaos',
                  impendingDoom: doom || 'Destruction',
                  grimPortents: [],
                  secrets: [],
                  locations: []
                };
                front.dangers.push(newDanger);
                await this.#saveFronts();
                await this.#fetchFronts();
                this.#expandedDangers.add(newDanger.id);
                this.render();
                ui.notifications.info(`Danger "${name}" erstellt`);
              }
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Abbrechen'
        }
      },
      default: 'save'
    }).render(true);
  }

  #showEditDangerDialog(dangerId) {
    const result = this.#getDanger(dangerId);
    if (!result) return;
    const danger = result.danger;

    new Dialog({
      title: `Danger bearbeiten: ${danger.name}`,
      content: `
        <form class="front-edit-dialog">
          <div class="form-group">
            <label>Name</label>
            <input type="text" name="name" value="${danger.name}">
          </div>
          <div class="form-group">
            <label>Typ</label>
            <input type="text" name="dangerType" value="${danger.dangerType || ''}">
          </div>
          <div class="form-group">
            <label>Impulse</label>
            <input type="text" name="impulse" value="${danger.impulse || ''}">
          </div>
          <div class="form-group">
            <label>Impending Doom</label>
            <input type="text" name="doom" value="${danger.impendingDoom || ''}">
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: 'Speichern',
          callback: async (html) => {
            danger.name = html.find('[name="name"]').val().trim();
            danger.dangerType = html.find('[name="dangerType"]').val().trim();
            danger.impulse = html.find('[name="impulse"]').val().trim();
            danger.impendingDoom = html.find('[name="doom"]').val().trim();
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
            ui.notifications.info('Danger aktualisiert');
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Abbrechen'
        }
      },
      default: 'save'
    }).render(true);
  }

  #showAddSecretDialog(dangerId) {
    new Dialog({
      title: 'Neues Secret erstellen',
      content: `
        <form class="front-edit-dialog">
          <div class="form-group">
            <label>XP-Wert</label>
            <select name="xp">
              <option value="20">20xp (Leicht)</option>
              <option value="30">30xp (Mittel)</option>
              <option value="50">50xp (Schwer)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Secret Text</label>
            <textarea name="text" rows="3" placeholder="Das Geheimnis..."></textarea>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: 'Erstellen',
          callback: async (html) => {
            const xp = parseInt(html.find('[name="xp"]').val());
            const text = html.find('[name="text"]').val().trim();

            if (text) {
              const result = this.#getDanger(dangerId);
              if (result?.danger) {
                if (!result.danger.secrets) result.danger.secrets = [];
                result.danger.secrets.push({
                  id: this.#generateId('secret'),
                  xp: xp,
                  text: text,
                  revealed: false,
                  revealedAt: null
                });
                await this.#saveFronts();
                await this.#fetchFronts();
                this.render();
                ui.notifications.info('Secret erstellt');
              }
            }
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Abbrechen'
        }
      },
      default: 'save'
    }).render(true);
  }

  #showEditSecretDialog(dangerId, secret) {
    if (!secret) return;

    new Dialog({
      title: 'Secret bearbeiten',
      content: `
        <form class="front-edit-dialog">
          <div class="form-group">
            <label>XP-Wert</label>
            <select name="xp">
              <option value="20" ${secret.xp === 20 ? 'selected' : ''}>20xp (Leicht)</option>
              <option value="30" ${secret.xp === 30 ? 'selected' : ''}>30xp (Mittel)</option>
              <option value="50" ${secret.xp === 50 ? 'selected' : ''}>50xp (Schwer)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Secret Text</label>
            <textarea name="text" rows="3">${secret.text}</textarea>
          </div>
        </form>
      `,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: 'Speichern',
          callback: async (html) => {
            secret.xp = parseInt(html.find('[name="xp"]').val());
            secret.text = html.find('[name="text"]').val().trim();
            await this.#saveFronts();
            await this.#fetchFronts();
            this.render();
            ui.notifications.info('Secret aktualisiert');
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: 'Abbrechen'
        }
      },
      default: 'save'
    }).render(true);
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  async refresh() {
    this.#frontsData = null;
    await this.#fetchFronts();
    this.render();
  }
}

// ============================================================================
// Handlebars Helper
// ============================================================================

Handlebars.registerHelper('eq', function(a, b) {
  return a === b;
});

// ============================================================================
// Hooks
// ============================================================================

// Add button to scene controls
Hooks.on('getSceneControlButtons', (controls) => {
  const tokenControls = controls.tokens;
  if (tokenControls?.tools) {
    tokenControls.tools['front-manager'] = {
      name: 'front-manager',
      title: 'Front Manager',
      icon: 'fas fa-scroll',
      button: true,
      visible: game.user.isGM,
      onChange: () => {
        // Toggle existing instance or create new one
        if (FrontManagerApp.instance?.rendered) {
          FrontManagerApp.instance.close();
        } else {
          new FrontManagerApp().render(true);
        }
      }
    };
  }
});

// Ready hook for initialization
Hooks.once('ready', () => {
  console.log(`${MODULE_ID} | Front Manager ready`);
});

// Export for console access
window.FrontManager = {
  open: () => new FrontManagerApp().render(true),
  refresh: () => FrontManagerApp.instance?.refresh()
};
