/**
 * ZULOX_ASISTENTE - Interfaz web
 * Etapa 3: registro de actividades por voz.
 *
 * No contiene secretos. La URL de la API y el token de sesión se guardan
 * solamente en el navegador del usuario (localStorage).
 */

(function () {
  'use strict';

  const VERSION = '0.8.1';
  const CLAVE_API = 'zulox.api';
  const CLAVE_TOKEN = 'zulox.token';
  const CLAVE_USUARIO = 'zulox.usuario';
  const CLAVE_EMAIL = 'zulox.email';
  const ESPERA_SILENCIO_MS = 3000;
  const ESPERA_CONFIRMACION_MS = 1800;
  const MAX_ESCUCHA_MS = 45000;
  const MAX_REINICIOS_DICTADO = 2;
  const ESPERA_MANUAL_MS = 700;
  const ESPERA_REINICIO_MS = 300;
  const VALIDEZ_DIAS_PRESUPUESTO = 15;
  const DIAS_SEGUIMIENTO_PRESUPUESTO = 7;
  const MONEDA_PRESUPUESTO = 'ARS';

  const estado = {
    api: '',
    token: '',
    usuario: null,
    reconocimiento: null,
    escuchando: false,
    dictadoTexto: '',
    dictadoParcial: '',
    dictadoFinalizado: false,
    dictadoManual: false,
    dictadoReinicios: 0,
    dictadoProcesando: false,
    dictadoError: false,
    timerSilencio: null,
    timerMaximo: null,
    timerManual: null,
    timerReinicio: null,
    ocupado: false,
    borrador: null,
    resumen: null,
    idempotencia: '',
    textoCompleto: '',
    accionPendiente: '',
    reprogramar: null,
    anular: null,
    opciones: [],
    reprogramarDialogo: null,
    inicio: '',
    agendaRango: 'hoy',
    agendaDesde: '',
    agendaHasta: '',
    agendaEtiqueta: '',
    agendaItems: [],
    directorioTipo: 'clientes',
    directorioItems: [],
    directorioSeleccion: null,
    directorioCargando: false,
    presupuestosEstado: 'TODOS',
    presupuestosItems: [],
    presupuestosCargando: false,
    presupuestoActual: null,
    presupuestoForm: null,
    clientesFormulario: [],
    itemPresupuestoEditando: null,
    trabajosEstado: 'TODOS',
    trabajosItems: [],
    trabajosCargando: false,
    trabajosSolicitud: 0,
    trabajoActual: null,
    trabajoDetalleSolicitud: 0,
    costoTrabajoEditando: null,
    adicionalTrabajoEditando: null,
    proveedoresFormulario: [],
    proveedoresFormularioCargados: false
  };

  const $ = function (id) { return document.getElementById(id); };

  const pantallas = {
    inicio: $('pantalla-inicio'),
    config: $('pantalla-config'),
    login: $('pantalla-login'),
    principal: $('pantalla-principal'),
    agenda: $('pantalla-agenda'),
    directorio: $('pantalla-directorio'),
    presupuestos: $('pantalla-presupuestos'),
    trabajos: $('pantalla-trabajos')
  };

  function iniciar() {
    $('version-pie').textContent = 'v' + VERSION;
    estado.api = (localStorage.getItem(CLAVE_API) || '').trim();
    estado.token = localStorage.getItem(CLAVE_TOKEN) || '';
    try {
      estado.usuario = JSON.parse(localStorage.getItem(CLAVE_USUARIO) || 'null');
    } catch (error) {
      estado.usuario = null;
    }

    conectarEventos();
    prepararReconocimiento();
    actualizarConexion();
    registrarServiceWorker();
    mostrarAvisosDeEntorno();

    if (!estado.api) {
      irA('config');
      configMensaje('Primero configurá la URL de la API.', false);
      return;
    }

    const emailGuardado = localStorage.getItem(CLAVE_EMAIL);
    if (emailGuardado) $('login-email').value = emailGuardado;

    if (!estado.token) {
      irA('login');
      return;
    }

    validarSesion();
  }

  function conectarEventos() {
    $('form-login').addEventListener('submit', entrar);
    $('form-config').addEventListener('submit', guardarConfiguracion);
    $('btn-probar-api').addEventListener('click', probarConexion);
    $('btn-config-volver').addEventListener('click', volverDeConfig);
    $('btn-login-config').addEventListener('click', abrirConfig);
    $('btn-config').addEventListener('click', abrirConfig);
    $('btn-salir').addEventListener('click', cerrarSesion);
    $('btn-micro').addEventListener('click', alternarMicro);
    $('form-manual').addEventListener('submit', enviarManual);
    $('btn-confirmar').addEventListener('click', confirmar);
    $('btn-corregir').addEventListener('click', corregir);
    $('btn-cancelar').addEventListener('click', cancelar);
    $('btn-agenda').addEventListener('click', function () { abrirAgenda('hoy'); });
    $('btn-agenda-volver').addEventListener('click', function () { irA('principal'); });
    $('btn-directorio').addEventListener('click', function () { abrirDirectorio('clientes'); });
    $('btn-directorio-volver').addEventListener('click', function () { irA('principal'); });
    $('form-buscar-directorio').addEventListener('submit', buscarDirectorio);
    $('btn-nuevo-directorio').addEventListener('click', abrirFormularioEntidad);
    $('form-entidad').addEventListener('submit', guardarEntidad);
    $('btn-entidad-cancelar').addEventListener('click', cerrarFormularioEntidad);
    $('btn-duplicados-cerrar').addEventListener('click', cerrarDialogoDuplicados);
    $('btn-presupuestos').addEventListener('click', function () { abrirPresupuestos(); });
    $('btn-presupuestos-volver').addEventListener('click', function () { irA('principal'); });
    $('btn-trabajos').addEventListener('click', function () { abrirTrabajos(); });
    $('btn-trabajos-volver').addEventListener('click', function () { irA('principal'); });
    $('form-buscar-trabajo').addEventListener('submit', buscarTrabajos);
    $('form-trabajo').addEventListener('submit', guardarTrabajo);
    $('btn-trabajo-cancelar').addEventListener('click', cerrarFormularioTrabajo);
    $('form-costo-trabajo').addEventListener('submit', guardarCostoTrabajo);
    $('btn-costo-trabajo-cancelar').addEventListener('click', cerrarFormularioCostoTrabajo);
    $('form-adicional-trabajo').addEventListener('submit', guardarAdicionalTrabajo);
    $('btn-adicional-trabajo-cancelar').addEventListener('click', cerrarFormularioAdicionalTrabajo);
    $('form-buscar-presupuesto').addEventListener('submit', buscarPresupuestos);
    $('btn-nuevo-presupuesto').addEventListener('click', function () { abrirFormularioPresupuesto(); });
    $('form-presupuesto').addEventListener('submit', guardarPresupuesto);
    $('btn-presupuesto-cancelar').addEventListener('click', cerrarFormularioPresupuesto);
    $('presupuesto-cliente').addEventListener('change', function () {
      actualizarDireccionTrabajoSugerida_(true);
    });
    $('form-item-presupuesto').addEventListener('submit', guardarItemPresupuesto);
    $('btn-item-presupuesto-cancelar').addEventListener('click', cerrarFormularioItemPresupuesto);
    $('item-presupuesto-cantidad').addEventListener('input', actualizarSubtotalItemPresupuesto);
    $('item-presupuesto-precio').addEventListener('input', actualizarSubtotalItemPresupuesto);
    document.querySelectorAll('.presupuestos-filtros .btn-filtro').forEach(function (boton) {
      boton.addEventListener('click', function () {
        if (boton.closest('#pantalla-trabajos')) {
          abrirTrabajos(boton.getAttribute('data-estado'));
        } else {
          abrirPresupuestos(boton.getAttribute('data-estado'));
        }
      });
    });
    document.querySelectorAll('.btn-filtro[data-rango]').forEach(function (boton) {
      boton.addEventListener('click', function () {
        abrirAgenda(boton.getAttribute('data-rango'));
      });
    });
    document.querySelectorAll('.directorio-tabs .btn-filtro').forEach(function (boton) {
      boton.addEventListener('click', function () {
        abrirDirectorio(boton.getAttribute('data-tipo'));
      });
    });

    window.addEventListener('online', actualizarConexion);
    window.addEventListener('offline', actualizarConexion);

    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', function () {});
    }
  }

  function irA(nombre) {
    Object.keys(pantallas).forEach(function (clave) {
      pantallas[clave].classList.toggle('oculto', clave !== nombre);
    });
    const enPrincipal = nombre === 'principal' || nombre === 'agenda' ||
      nombre === 'directorio' || nombre === 'presupuestos' || nombre === 'trabajos';
    $('btn-salir').classList.toggle('oculto', !enPrincipal);
    $('btn-config').classList.toggle('oculto', nombre === 'config');
    window.scrollTo(0, 0);
  }

  function actualizarConexion() {
    const enLinea = navigator.onLine;
    $('aviso-conexion').hidden = enLinea;
    const estadoApi = $('estado-api');
    if (estadoApi) {
      estadoApi.textContent = enLinea ? 'Conectado' : 'Sin conexión';
      estadoApi.classList.toggle('desconectado', !enLinea);
    }
  }

  function mostrarAvisosDeEntorno() {
    const aviso = $('aviso-mic');
    const seguro = location.protocol === 'https:' ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if (!seguro) {
      aviso.textContent = 'El micrófono solo funciona con HTTPS o en localhost. ' +
        'Mientras tanto podés escribir la frase abajo.';
      aviso.classList.remove('oculto');
    } else if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
      aviso.textContent = 'Este navegador no tiene reconocimiento de voz. ' +
        'Usá Chrome en Android o escribí la frase abajo.';
      aviso.classList.remove('oculto');
    }
  }

  function registrarServiceWorker() {
    const seguro = location.protocol === 'https:' ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!seguro || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js').catch(function () {
      // Si falla, la app sigue funcionando sin modo instalable.
    });
  }

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  function api(accion, datos, opciones) {
    const opcionesApi = opciones || {};
    const reintentar = opcionesApi.reintentar !== undefined
      ? !!opcionesApi.reintentar
      : esAccionLectura_(accion);
    return apiEn(estado.api, accion, datos, reintentar ? 2 : 1);
  }

  function esAccionLectura_(accion) {
    const clave = String(accion || '').toLowerCase();
    if (!clave) return false;
    if (clave === 'sesion' || clave === 'ping') return true;
    return /\.(buscar|listar|obtener)$/.test(clave);
  }

  function errorApi_(mensaje, codigo, reintentable) {
    const error = new Error(mensaje);
    if (codigo) error.codigo = codigo;
    error.reintentable = !!reintentable;
    return error;
  }

  function esperarMs_(ms) {
    return new Promise(function (resolver) {
      setTimeout(resolver, ms);
    });
  }

  async function apiEn(url, accion, datos, intentos) {
    const total = Math.max(1, Number(intentos) || 1);
    let ultimoError = null;
    for (let intento = 1; intento <= total; intento++) {
      try {
        return await enviarApi_(url, accion, datos);
      } catch (error) {
        ultimoError = error;
        if (!error.reintentable || intento >= total) throw error;
        await esperarMs_(1200);
      }
    }
    throw ultimoError || new Error('La API no respondió.');
  }

  async function enviarApi_(url, accion, datos) {
    if (!url) throw new Error('Falta configurar la URL de la API.');

    const cuerpo = Object.assign({ accion: accion }, datos || {});
    if (estado.token && !cuerpo.token) cuerpo.token = estado.token;
    const lectura = esAccionLectura_(accion);

    const controlador = new AbortController();
    const temporizador = setTimeout(function () { controlador.abort(); }, 45000);

    let respuesta;
    try {
      respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(cuerpo),
        redirect: 'follow',
        signal: controlador.signal
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw errorApi_(
          lectura
            ? 'La API tardó demasiado. Revisá la conexión e intentá de nuevo.'
            : 'La API tardó demasiado. No sabemos si el cambio se guardó: recargá el trabajo antes de reintentar.',
          'TIEMPO_AGOTADO',
          true
        );
      }
      throw errorApi_(
        'No pude conectarme con la API. Revisá Internet y la URL.',
        'SIN_CONEXION',
        true
      );
    } finally {
      clearTimeout(temporizador);
    }

    const texto = await respuesta.text();
    let json;
    try {
      json = JSON.parse(texto);
    } catch (error) {
      throw errorApi_(
        'La API respondió algo inesperado. Verificá que la URL termine en /exec.',
        'RESPUESTA_INVALIDA',
        false
      );
    }

    if (!json.ok) {
      const fallo = errorApi_(
        json.mensaje || 'La operación falló.',
        json.codigo || 'ERROR',
        false
      );
      if (fallo.codigo === 'SESION_INVALIDA' || fallo.codigo === 'SESION_VENCIDA') {
        limpiarSesion();
      }
      throw fallo;
    }
    return json.datos;
  }

  async function validarSesion() {
    try {
      const datos = await api('sesion');
      estado.usuario = datos;
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos));
      entrarEnPrincipal();
    } catch (error) {
      limpiarSesion();
      irA('login');
      if (error.codigo !== 'SESION_INVALIDA' && error.codigo !== 'SESION_VENCIDA') {
        loginMensaje(error.message);
      }
    }
  }

  async function entrar(evento) {
    evento.preventDefault();
    const email = $('login-email').value.trim();
    const pin = $('login-pin').value.trim();
    const boton = $('form-login').querySelector('button[type="submit"]');

    loginMensaje('');
    boton.disabled = true;
    boton.textContent = 'Entrando…';

    try {
      const datos = await api('login', { email: email, pin: pin });
      estado.token = datos.token;
      estado.usuario = datos.usuario;
      localStorage.setItem(CLAVE_TOKEN, datos.token);
      localStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos.usuario));
      localStorage.setItem(CLAVE_EMAIL, email);
      $('login-pin').value = '';
      entrarEnPrincipal();
    } catch (error) {
      loginMensaje(error.message);
      $('login-pin').value = '';
      $('login-pin').focus();
    } finally {
      boton.disabled = false;
      boton.textContent = 'Entrar';
    }
  }

  function entrarEnPrincipal() {
    irA('principal');
    const nombre = nombreSaludo_();
    $('saludo').textContent = nombre ? 'Hola ' + nombre : 'Hola';
    $('conversacion').innerHTML = '';
    transcripcion('');
    agregarMensaje('asistente', '¿Qué querés agendar o consultar?');
    limpiarBorrador();
    estado.inicio = '';
    setTimeout(function () {
      if (!estado.inicio) {
        estado.inicio = '1';
        hablar('¿Qué querés agendar o consultar?');
      }
    }, 500);
  }

  function cerrarSesion() {
    if (!estado.token) {
      limpiarSesion();
      irA('login');
      return;
    }
    api('logout').catch(function () {}).finally(function () {
      limpiarSesion();
      irA('login');
    });
  }

  function limpiarSesion() {
    estado.token = '';
    estado.usuario = null;
    estado.textoCompleto = '';
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
    $('btn-salir').classList.add('oculto');
    const conversacion = $('conversacion');
    if (conversacion) conversacion.innerHTML = '';
    limpiarBorrador();
    if ($('indicador')) indicador('Tocá el micrófono y hablá');
    if ($('transcripcion')) transcripcion('');
  }

  function loginMensaje(texto) {
    $('login-mensaje').textContent = texto || '';
  }

  // -------------------------------------------------------------------------
  // Configuración
  // -------------------------------------------------------------------------

  function abrirConfig() {
    $('api-url').value = estado.api;
    configMensaje('', false);
    irA('config');
  }

  function volverDeConfig() {
    if (estado.token) {
      irA('principal');
    } else if (estado.api) {
      irA('login');
    } else {
      irA('config');
    }
  }

  function normalizarUrl(valor) {
    return String(valor || '').trim().replace(/\/+$/, '');
  }

  async function guardarConfiguracion(evento) {
    evento.preventDefault();
    const url = normalizarUrl($('api-url').value);
    if (!/^https?:\/\//i.test(url)) {
      configMensaje('La URL debe empezar con https://', false);
      return;
    }

    estado.api = url;
    localStorage.setItem(CLAVE_API, url);
    configMensaje('Guardada. Probando conexión…', true);

    try {
      const datos = await apiEn(url, 'ping');
      configMensaje('Conexión OK. API versión ' + (datos.version || '?') + '.', true);
      setTimeout(function () {
        if (estado.token) {
          validarSesion();
        } else {
          irA('login');
        }
      }, 700);
    } catch (error) {
      configMensaje('Se guardó, pero la prueba falló: ' + error.message, false);
    }
  }

  async function probarConexion() {
    const url = normalizarUrl($('api-url').value);
    if (!url) {
      configMensaje('Escribí la URL de la API.', false);
      return;
    }
    $('btn-probar-api').disabled = true;
    configMensaje('Probando…', true);
    try {
      const datos = await apiEn(url, 'ping');
      configMensaje('Conexión OK. Servicio ' + (datos.servicio || 'ZULOX_ASISTENTE') +
        ', versión ' + (datos.version || '?') + '.', true);
    } catch (error) {
      configMensaje('Falló: ' + error.message, false);
    } finally {
      $('btn-probar-api').disabled = false;
    }
  }

  function configMensaje(texto, correcto) {
    const nodo = $('config-mensaje');
    nodo.textContent = texto || '';
    nodo.classList.toggle('ok', !!correcto);
  }

  // -------------------------------------------------------------------------
  // Voz
  // -------------------------------------------------------------------------

  function prepararReconocimiento() {
    const Constructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Constructor) return;

    const reconocimiento = new Constructor();
    reconocimiento.lang = 'es-AR';
    reconocimiento.continuous = true;
    reconocimiento.interimResults = true;
    reconocimiento.maxAlternatives = 1;

    reconocimiento.onstart = function () {
      if (estado.dictadoFinalizado) {
        try { reconocimiento.abort(); } catch (error) {}
        return;
      }
      estado.escuchando = true;
      marcarMicro(true);
      indicador('Escuchando. Hablá tranquilo; proceso cuando hagas una pausa.');
    };

    reconocimiento.onresult = function (evento) {
      let parcial = '';
      let huboFinal = false;
      const inicio = evento.resultIndex || 0;
      for (let i = inicio; i < evento.results.length; i++) {
        const texto = evento.results[i][0].transcript;
        if (evento.results[i].isFinal) {
          huboFinal = true;
          estado.dictadoTexto = unirTextoVoz_(estado.dictadoTexto, texto);
        } else {
          parcial = texto;
        }
      }
      estado.dictadoParcial = parcial;
      const visible = textoDictadoActual_();
      if (visible) transcripcion(visible);
      if (huboFinal || parcial) reiniciarSilencio();
    };

    reconocimiento.onerror = function (evento) {
      estado.escuchando = false;
      marcarMicro(false);
      if (evento.error === 'aborted') return;

      estado.dictadoError = true;
      if (textoDictadoActual_()) {
        finalizarDictado('error');
        return;
      }

      estado.dictadoReinicios = MAX_REINICIOS_DICTADO;
      const mensajes = {
        'not-allowed': 'El micrófono está bloqueado. Permitilo en el navegador.',
        'service-not-allowed': 'El micrófono necesita HTTPS o localhost.',
        'no-speech': 'No escuché nada. Tocá el micrófono y probá de nuevo.',
        'audio-capture': 'No encontré un micrófono disponible.',
        network: 'El reconocimiento de voz necesita Internet.'
      };
      indicador(mensajes[evento.error] || 'No pude escuchar. Probá otra vez.');
    };

    reconocimiento.onend = function () {
      estado.escuchando = false;
      marcarMicro(false);
      if (estado.dictadoFinalizado || estado.dictadoProcesando) return;
      if (estado.dictadoError) {
        limpiarDictado();
        estado.dictadoError = true;
        return;
      }

      const texto = textoDictadoActual_();
      if (texto) {
        if (estado.dictadoManual) {
          finalizarDictado('manual');
          return;
        }
        if (estado.dictadoReinicios < MAX_REINICIOS_DICTADO && !estado.ocupado) {
          estado.dictadoReinicios += 1;
          programarReinicio_();
          return;
        }
        finalizarDictado('fin');
        return;
      }

      if (!estado.dictadoManual && estado.dictadoReinicios < 1 && !estado.ocupado) {
        estado.dictadoReinicios += 1;
        programarReinicio_();
        return;
      }

      if (!estado.ocupado && !estado.resumen) {
        indicador('No escuché nada. Tocá el micrófono y probá de nuevo.');
      }
      limpiarDictado();
    };

    estado.reconocimiento = reconocimiento;
  }

  function marcarMicro(activo) {
    $('btn-micro').classList.toggle('escuchando', !!activo);
    $('btn-micro').setAttribute('aria-pressed', activo ? 'true' : 'false');
  }

  function juntarTexto_(parte1, parte2) {
    return (String(parte1 || '') + ' ' + String(parte2 || ''))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function textoDictadoActual_() {
    return unirTextoVoz_(estado.dictadoTexto, estado.dictadoParcial);
  }

  function unirTextoVoz_(base, nuevo) {
    const a = String(base || '').replace(/\s+/g, ' ').trim();
    const b = String(nuevo || '').replace(/\s+/g, ' ').trim();
    if (!a) return b;
    if (!b) return a;

    const la = a.toLowerCase();
    const lb = b.toLowerCase();
    if (la === lb) return a;
    if (lb.indexOf(la) === 0) return b;
    if (la.indexOf(lb) === 0) return a;

    const pa = la.split(' ');
    const pb = lb.split(' ');
    if (pa.length >= pb.length && pa.slice(-pb.length).join(' ') === lb) return a;

    const max = Math.min(pa.length, pb.length);
    for (let n = max; n > 0; n--) {
      if (pa.slice(-n).join(' ') === pb.slice(0, n).join(' ')) {
        return (a + ' ' + b.split(/\s+/).slice(n).join(' '))
          .replace(/\s+/g, ' ').trim();
      }
    }
    return a + ' ' + b;
  }

  function reiniciarSilencio() {
    clearTimeout(estado.timerSilencio);
    const espera = (estado.resumen || estado.opciones.length)
      ? ESPERA_CONFIRMACION_MS
      : ESPERA_SILENCIO_MS;
    estado.timerSilencio = setTimeout(function () {
      finalizarDictado('silencio');
    }, espera);
  }

  function programarReinicio_() {
    clearTimeout(estado.timerReinicio);
    estado.timerReinicio = setTimeout(function () {
      if (estado.dictadoFinalizado || estado.dictadoProcesando || estado.ocupado) return;
      if (estado.escuchando) return;
      try {
        estado.reconocimiento.start();
      } catch (error) {
        finalizarDictado('fin');
      }
    }, ESPERA_REINICIO_MS);
  }

  function detenerDictado() {
    estado.dictadoManual = true;
    clearTimeout(estado.timerSilencio);
    clearTimeout(estado.timerReinicio);
    indicador('Listo, proceso lo que dijiste.');
    try { estado.reconocimiento.stop(); } catch (error) {}
    clearTimeout(estado.timerManual);
    estado.timerManual = setTimeout(function () {
      finalizarDictado('manual');
    }, ESPERA_MANUAL_MS);
  }

  function finalizarDictado(motivo) {
    if (estado.dictadoFinalizado || estado.dictadoProcesando) return;
    estado.dictadoFinalizado = true;
    estado.dictadoProcesando = true;
    clearTimeout(estado.timerSilencio);
    clearTimeout(estado.timerMaximo);
    clearTimeout(estado.timerManual);
    clearTimeout(estado.timerReinicio);
    estado.escuchando = false;
    marcarMicro(false);
    try {
      if (estado.reconocimiento) estado.reconocimiento.abort();
    } catch (error) {}

    const texto = textoDictadoActual_();
    estado.dictadoTexto = '';
    estado.dictadoParcial = '';
    estado.dictadoManual = false;
    estado.dictadoReinicios = 0;

    if (!texto) {
      estado.dictadoProcesando = false;
      estado.dictadoFinalizado = true;
      estado.dictadoReinicios = MAX_REINICIOS_DICTADO;
      indicador('No escuché nada. Tocá el micrófono y probá de nuevo.');
      return;
    }

    transcripcion(texto);
    if (estado.ocupado) {
      estado.dictadoProcesando = false;
      estado.dictadoFinalizado = true;
      estado.dictadoReinicios = MAX_REINICIOS_DICTADO;
      indicador('Esperá un momento y volvé a hablar.');
      return;
    }

    procesarTexto(texto);
  }

  function limpiarDictado() {
    clearTimeout(estado.timerSilencio);
    clearTimeout(estado.timerMaximo);
    clearTimeout(estado.timerManual);
    clearTimeout(estado.timerReinicio);
    estado.dictadoTexto = '';
    estado.dictadoParcial = '';
    estado.dictadoFinalizado = false;
    estado.dictadoManual = false;
    estado.dictadoReinicios = 0;
    estado.dictadoProcesando = false;
    estado.dictadoError = false;
  }

  function alternarMicro() {
    if (!estado.reconocimiento) {
      indicador('Este navegador no tiene reconocimiento de voz. Escribí la frase abajo.');
      $('entrada-manual').focus();
      return;
    }
    const dictadoActivo = !estado.dictadoFinalizado && !estado.dictadoProcesando &&
      (estado.escuchando || estado.dictadoTexto || estado.dictadoParcial ||
        estado.timerMaximo);
    if (dictadoActivo) {
      detenerDictado();
      return;
    }
    iniciarEscucha();
  }

  function iniciarEscucha() {
    if (!estado.reconocimiento || estado.ocupado) return;
    if (!navigator.onLine) {
      indicador('Sin conexión. El reconocimiento de voz necesita Internet.');
      return;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    limpiarDictado();
    estado.escuchando = false;
    marcarMicro(false);
    transcripcion('');
    indicador('Escuchando. Hablá tranquilo; proceso cuando hagas una pausa.');
    estado.timerMaximo = setTimeout(function () {
      finalizarDictado('maximo');
    }, MAX_ESCUCHA_MS);
    try {
      estado.reconocimiento.start();
    } catch (error) {
      limpiarDictado();
      indicador('Tocá el micrófono para responder');
    }
  }

  function hablar(texto, alTerminar) {
    if (!texto) {
      if (alTerminar) alTerminar();
      return;
    }
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      if (alTerminar) alTerminar();
      return;
    }

    window.speechSynthesis.cancel();
    const locucion = new SpeechSynthesisUtterance(texto);
    locucion.lang = 'es-AR';
    locucion.rate = 1.03;
    locucion.pitch = 1;

    const voces = window.speechSynthesis.getVoices();
    const espanol = voces.filter(function (v) { return /^es/i.test(v.lang); });
    const argentina = espanol.filter(function (v) { return /AR/i.test(v.lang); })[0];
    if (argentina || espanol[0]) locucion.voice = argentina || espanol[0];

    let terminado = false;
    const finalizar = function () {
      if (terminado) return;
      terminado = true;
      if (alTerminar) alTerminar();
    };
    locucion.onend = finalizar;
    locucion.onerror = finalizar;
    window.speechSynthesis.speak(locucion);
  }

  // -------------------------------------------------------------------------
  // Conversación
  // -------------------------------------------------------------------------

  function procesarTexto(texto) {
    const limpio = String(texto || '').trim();
    if (!limpio || estado.ocupado) return;
    transcripcion('');

    if (estado.resumen) {
      const decision = normalizar(limpio);
      if (/^(si|dale|confirmo|confirmar|ok|okey|correcto|listo|guarda|guardalo|perfecto)$/.test(decision)) {
        confirmar();
        return;
      }
      if (/^(no|cancelar|anular|olvidalo|olvidate|borralo)$/.test(decision)) {
        cancelar();
        return;
      }
    }

    if (estado.opciones.length) {
      const elegida = elegirPorTexto(limpio);
      if (elegida) {
        agregarMensaje('usuario', limpio);
        procesarOpcion(elegida);
        return;
      }
      limpiarOpciones();
    }

    agregarMensaje('usuario', limpio);
    estado.textoCompleto = (estado.textoCompleto ? estado.textoCompleto + ' ' : '') + limpio;
    estado.ocupado = true;
    indicador('Interpretando…');
    $('btn-micro').disabled = true;

    api('voz.interpretar', {
      texto: limpio,
      borrador: estado.borrador,
      reprogramar: estado.reprogramar
    })
      .then(function (respuesta) {
        if (respuesta.intencion === 'PRESUPUESTO_CONSULTAR') {
          limpiarBorrador();
          abrirPresupuestos(respuesta.estado || 'TODOS');
          agregarMensaje('asistente', respuesta.mensaje || 'Abriendo presupuestos.');
          hablar(respuesta.mensaje || 'Abriendo presupuestos.');
          return;
        }

        if (respuesta.intencion === 'PRESUPUESTO_CREAR' ||
            respuesta.intencion === 'PRESUPUESTO_ESTADO') {
          manejarRespuestaPresupuesto(respuesta);
          return;
        }

        if (respuesta.intencion === 'CONSULTAR' && respuesta.soportado && respuesta.rango) {
          limpiarBorrador();
          abrirAgendaRango(respuesta.rango);
          return;
        }

        if (respuesta.intencion === 'REPROGRAMAR') {
          manejarRespuestaReprogramar(respuesta);
          return;
        }

        if (respuesta.intencion === 'ANULAR') {
          manejarRespuestaAnular(respuesta);
          return;
        }

        if (respuesta.intencion === 'CLIENTE_CREAR' || respuesta.intencion === 'PROVEEDOR_CREAR') {
          estado.borrador = respuesta.datos;
          estado.accionPendiente = respuesta.intencion === 'CLIENTE_CREAR' ? 'crear_cliente' : 'crear_proveedor';

          if (respuesta.faltantes && respuesta.faltantes.length) {
            cerrarResumen();
            agregarMensaje('asistente', respuesta.pregunta);
            indicador(respuesta.pregunta);
            setTimeout(function () { hablar(respuesta.pregunta, iniciarEscucha); }, 0);
            return;
          }

          estado.resumen = respuesta;
          estado.idempotencia = nuevaClave();
          mostrarResumen(respuesta.resumen);
          agregarMensaje('asistente', 'Revisá el resumen. ¿Confirmás?');
          indicador('Decí «sí» o tocá Confirmar');
          setTimeout(function () {
            hablar(respuesta.resumen + ' ¿Confirmás?', iniciarEscucha);
          }, 0);
          return;
        }

        if (!respuesta.soportado) {
          agregarMensaje('asistente', respuesta.mensaje);
          limpiarBorrador();
          hablar(respuesta.mensaje);
          return;
        }

        estado.borrador = respuesta.datos;

        if (respuesta.faltantes && respuesta.faltantes.length) {
          cerrarResumen();
          agregarMensaje('asistente', respuesta.pregunta);
          indicador(respuesta.pregunta);
          setTimeout(function () { hablar(respuesta.pregunta, iniciarEscucha); }, 0);
          return;
        }

        estado.resumen = respuesta;
        estado.idempotencia = nuevaClave();
        mostrarResumen(respuesta.resumen);
        agregarMensaje('asistente', 'Revisá el resumen. ¿Confirmás?');
        indicador('Decí «sí» o tocá Confirmar');
        setTimeout(function () {
          hablar(respuesta.resumen + ' ¿Confirmás?', iniciarEscucha);
        }, 0);
      })
      .catch(function (error) {
        manejarError(error);
      })
      .finally(function () {
        estado.ocupado = false;
        $('btn-micro').disabled = false;
      });
  }

  function mostrarResumen(texto) {
    $('resumen-texto').textContent = texto;
    $('tarjeta-resumen').classList.remove('oculto');
    $('tarjeta-resumen').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cerrarResumen() {
    estado.resumen = null;
    estado.idempotencia = '';
    $('tarjeta-resumen').classList.add('oculto');
    $('resumen-texto').textContent = '';
  }

  function limpiarBorrador() {
    estado.borrador = null;
    estado.textoCompleto = '';
    estado.reprogramar = null;
    estado.anular = null;
    estado.accionPendiente = '';
    limpiarOpciones();
    cerrarResumen();
  }

  function deshabilitarResumen(deshabilitar) {
    ['btn-confirmar', 'btn-corregir', 'btn-cancelar'].forEach(function (id) {
      $(id).disabled = !!deshabilitar;
    });
  }

  function manejarRespuestaPresupuesto(respuesta) {
    if (!respuesta.soportado) {
      agregarMensaje('asistente', respuesta.mensaje);
      indicador(respuesta.mensaje);
      hablar(respuesta.mensaje);
      return;
    }

    if (respuesta.faltantes && respuesta.faltantes.length) {
      cerrarResumen();
      agregarMensaje('asistente', respuesta.pregunta || respuesta.mensaje);
      indicador(respuesta.pregunta || respuesta.mensaje);
      setTimeout(function () {
        hablar(respuesta.pregunta || respuesta.mensaje, iniciarEscucha);
      }, 0);
      return;
    }

    estado.borrador = respuesta.datos;
    estado.accionPendiente = respuesta.intencion === 'PRESUPUESTO_CREAR'
      ? 'crear_presupuesto'
      : 'estado_presupuesto';
    estado.resumen = respuesta;
    estado.idempotencia = nuevaClave();
    mostrarResumen(respuesta.resumen);
    agregarMensaje('asistente', 'Revisá el resumen. ¿Confirmás?');
    indicador('Decí «sí» o tocá Confirmar');
    setTimeout(function () {
      hablar(respuesta.resumen + ' ¿Confirmás?', iniciarEscucha);
    }, 0);
  }

  function manejarRespuestaReprogramar(respuesta) {
    if (respuesta.opciones && respuesta.opciones.length) {
      mostrarOpciones('reprogramar', respuesta.opciones);
      agregarMensaje('asistente', respuesta.pregunta);
      indicador(respuesta.pregunta);
      hablar(respuesta.pregunta);
      return;
    }

    if (respuesta.sin_resultados) {
      agregarMensaje('asistente', respuesta.mensaje);
      indicador(respuesta.mensaje);
      hablar(respuesta.mensaje);
      return;
    }

    if (respuesta.faltantes && respuesta.faltantes.length) {
      if (respuesta.datos && respuesta.datos.actividad_id) {
        estado.reprogramar = respuesta.datos;
      }
      cerrarResumen();
      agregarMensaje('asistente', respuesta.pregunta);
      indicador(respuesta.pregunta);
      setTimeout(function () { hablar(respuesta.pregunta, iniciarEscucha); }, 0);
      return;
    }

    estado.reprogramar = respuesta.datos;
    estado.accionPendiente = 'reprogramar';
    estado.resumen = { resumen: respuesta.resumen };
    estado.idempotencia = nuevaClave();
    mostrarResumen(respuesta.resumen);
    agregarMensaje('asistente', 'Revisá el cambio. ¿Confirmás?');
    indicador('Decí «sí» o tocá Confirmar');
    setTimeout(function () {
      hablar(respuesta.resumen + ' ¿Confirmás?', iniciarEscucha);
    }, 0);
  }

  function manejarRespuestaAnular(respuesta) {
    if (respuesta.opciones && respuesta.opciones.length) {
      mostrarOpciones('anular', respuesta.opciones);
      agregarMensaje('asistente', respuesta.pregunta);
      indicador(respuesta.pregunta);
      hablar(respuesta.pregunta);
      return;
    }

    if (respuesta.sin_resultados) {
      agregarMensaje('asistente', respuesta.mensaje);
      indicador(respuesta.mensaje);
      hablar(respuesta.mensaje);
      return;
    }

    if (respuesta.faltantes && respuesta.faltantes.length) {
      agregarMensaje('asistente', respuesta.pregunta);
      indicador(respuesta.pregunta);
      hablar(respuesta.pregunta);
      return;
    }

    estado.anular = respuesta.datos;
    estado.accionPendiente = 'anular';
    estado.resumen = { resumen: respuesta.resumen };
    mostrarResumen(respuesta.resumen);
    agregarMensaje('asistente', 'Revisá antes de anular. ¿Confirmás?');
    indicador('Decí «sí» o tocá Confirmar');
    setTimeout(function () {
      hablar(respuesta.resumen + ' ¿Confirmás?', iniciarEscucha);
    }, 0);
  }

  function mostrarOpciones(tipo, opciones) {
    const caja = $('opciones-accion');
    caja.innerHTML = '';
    estado.opciones = opciones.map(function (opcion) {
      return Object.assign({ _tipo: tipo }, opcion);
    });

    estado.opciones.forEach(function (opcion) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'opcion-accion';
      boton.textContent = descripcionOpcion(opcion);
      boton.addEventListener('click', function () { procesarOpcion(opcion); });
      caja.appendChild(boton);
    });
    caja.classList.remove('oculto');
  }

  function limpiarOpciones() {
    estado.opciones = [];
    const caja = $('opciones-accion');
    if (!caja) return;
    caja.innerHTML = '';
    caja.classList.add('oculto');
  }

  function descripcionOpcion(opcion) {
    return fechaCorta(opcion.fecha) + ' ' + (opcion.hora || '--:--') +
      ' · ' + tipoLegible(opcion.tipo) +
      (opcion.cliente_nombre ? ' · ' + opcion.cliente_nombre : '') +
      (opcion.motivo ? ' · ' + opcion.motivo : '');
  }

  function elegirPorTexto(texto) {
    const limpio = normalizar(texto);
    if (/^(la )?(primera|1)$/.test(limpio)) return estado.opciones[0];
    if (/^(la )?(segunda|2)$/.test(limpio)) return estado.opciones[1];
    if (/^(la )?(tercera|3)$/.test(limpio)) return estado.opciones[2];

    const coincidencias = estado.opciones.filter(function (opcion) {
      const nombre = normalizar(opcion.cliente_nombre || '');
      const motivo = normalizar(opcion.motivo || '');
      if (nombre && limpio.indexOf(nombre) !== -1) return true;
      if (motivo && limpio.indexOf(motivo) !== -1) return true;
      const palabras = nombre.split(' ').filter(function (p) { return p.length >= 3; });
      return palabras.some(function (p) { return limpio.indexOf(p) !== -1; });
    });
    return coincidencias.length === 1 ? coincidencias[0] : null;
  }

  function procesarOpcion(opcion) {
    if (!opcion) return;
    const tipo = opcion._tipo || 'reprogramar';
    limpiarOpciones();

    if (tipo === 'anular') {
      estado.anular = opcion;
      estado.accionPendiente = 'anular';
      const resumen = 'Anular ' + tipoLegible(opcion.tipo) +
        (opcion.cliente_nombre ? ' con ' + opcion.cliente_nombre : '') +
        ' del ' + fechaCorta(opcion.fecha) + ' a las ' + (opcion.hora || '--:--') +
        '. Queda cancelada, no se borra.';
      estado.resumen = { resumen: resumen };
      mostrarResumen(resumen);
      agregarMensaje('asistente', 'Revisá antes de anular. ¿Confirmás?');
      indicador('Decí «sí» o tocá Confirmar');
      hablar(resumen + ' ¿Confirmás?', iniciarEscucha);
      return;
    }

    estado.reprogramar = opcion;
    agregarMensaje('asistente', '¿Para qué fecha y hora la reprogramo?');
    indicador('Decí la nueva fecha y hora');
    hablar('¿Para qué fecha y hora la reprogramo?', iniciarEscucha);
  }

  function confirmar() {
    if (!estado.resumen || estado.ocupado) return;

    if (estado.accionPendiente === 'reprogramar') {
      confirmarReprogramacion();
      return;
    }
    if (estado.accionPendiente === 'anular') {
      confirmarAnulacion();
      return;
    }
    if (estado.accionPendiente === 'crear_cliente') {
      confirmarCliente();
      return;
    }
    if (estado.accionPendiente === 'crear_proveedor') {
      confirmarProveedor();
      return;
    }
    if (estado.accionPendiente === 'crear_presupuesto' ||
        estado.accionPendiente === 'estado_presupuesto') {
      confirmarPresupuestoVoz();
      return;
    }
    if (!estado.borrador) return;

    estado.ocupado = true;
    deshabilitarResumen(true);
    indicador('Guardando…');

    const resumen = estado.resumen.resumen;

    api('voz.confirmar', {
      actividad: estado.borrador,
      texto: estado.textoCompleto,
      idempotencia: estado.idempotencia
    })
      .then(function (resultado) {
        const mensaje = resultado.repetido
          ? 'Esa actividad ya estaba guardada. Número ' + resultado.actividad_id + '.'
          : 'Listo. Guardé la actividad ' + resultado.actividad_id + '.';
        agregarMensaje('sistema', mensaje);
        hablar(resultado.repetido ? mensaje : 'Listo. La actividad quedó guardada.');
        limpiarBorrador();
        indicador('Tocá el micrófono para agendar otra');
        if (resumen) agregarMensaje('asistente', '¿Querés agendar otra cosa?');
      })
      .catch(function (error) {
        manejarError(error);
      })
      .finally(function () {
        estado.ocupado = false;
        $('btn-confirmar').disabled = false;
        $('btn-corregir').disabled = false;
        $('btn-cancelar').disabled = false;
      });
  }

  function confirmarCliente() {
    const datos = estado.borrador;
    if (!datos || estado.ocupado) return;

    estado.ocupado = true;
    deshabilitarResumen(true);
    indicador('Guardando cliente…');

    api('voz.cliente.crear', {
      cliente: {
        nombre: datos.nombre,
        apellido: datos.apellido,
        tipo: datos.tipo,
        telefono: datos.telefono,
        email: datos.email,
        direccion: datos.direccion,
        localidad: datos.localidad
      },
      texto: estado.textoCompleto,
      idempotencia: estado.idempotencia
    })
      .then(function (resultado) {
        const mensaje = resultado.repetido
          ? 'Este cliente ya estaba guardado.'
          : 'Listo. Guardé el cliente ' + resultado.cliente_id + '.';
        agregarMensaje('sistema', mensaje);
        hablar(resultado.repetido ? mensaje : 'Listo. El cliente quedó guardado.');
        limpiarBorrador();
        indicador('Tocá el micrófono para agendar otra');
        if (estado.resumen && estado.resumen.resumen) {
          agregarMensaje('asistente', '¿Querés cargar otro cliente?');
        }
      })
      .catch(function (error) {
        manejarError(error);
      })
      .finally(function () {
        estado.ocupado = false;
        $('btn-confirmar').disabled = false;
        $('btn-corregir').disabled = false;
        $('btn-cancelar').disabled = false;
      });
  }

  function confirmarProveedor() {
    const datos = estado.borrador;
    if (!datos || estado.ocupado) return;

    estado.ocupado = true;
    deshabilitarResumen(true);
    indicador('Guardando proveedor…');

    api('voz.proveedor.crear', {
      proveedor: {
        nombre_comercial: datos.nombre_comercial,
        contacto: datos.contacto,
        telefono: datos.telefono,
        email: datos.email,
        direccion: datos.direccion,
        materiales: datos.materiales
      },
      texto: estado.textoCompleto,
      idempotencia: estado.idempotencia
    })
      .then(function (resultado) {
        const mensaje = resultado.repetido
          ? 'Este proveedor ya estaba guardado.'
          : 'Listo. Guardé el proveedor ' + resultado.proveedor_id + '.';
        agregarMensaje('sistema', mensaje);
        hablar(resultado.repetido ? mensaje : 'Listo. El proveedor quedó guardado.');
        limpiarBorrador();
        indicador('Tocá el micrófono para agendar otra');
        if (estado.resumen && estado.resumen.resumen) {
          agregarMensaje('asistente', '¿Querés cargar otro proveedor?');
        }
      })
      .catch(function (error) {
        manejarError(error);
      })
      .finally(function () {
        estado.ocupado = false;
        $('btn-confirmar').disabled = false;
        $('btn-corregir').disabled = false;
        $('btn-cancelar').disabled = false;
      });
  }

  function confirmarPresupuestoVoz() {
    const datos = estado.borrador;
    if (!datos || estado.ocupado) return;
    const creando = estado.accionPendiente === 'crear_presupuesto';

    estado.ocupado = true;
    deshabilitarResumen(true);
    indicador(creando ? 'Guardando presupuesto…' : 'Actualizando presupuesto…');

    const peticion = creando
      ? api('presupuesto.crear', {
        presupuesto: datos,
        idempotencia: estado.idempotencia
      })
      : api('presupuesto.estado', {
        presupuesto_id: datos.presupuesto_id,
        estado: datos.estado,
        motivo: 'Cambio por voz'
      });

    peticion
      .then(function (resultado) {
        const presupuesto = (resultado && resultado.presupuesto) || {};
        const id = presupuesto.presupuesto_id || datos.presupuesto_id;
        const mensaje = creando
          ? 'Listo. Guardé el presupuesto ' + id + '.'
          : 'Listo. El presupuesto ' + id + ' quedó ' +
            estadoPresupuestoLegible_(datos.estado).toLowerCase() + '.';
        agregarMensaje('sistema', mensaje);
        hablar(mensaje);
        limpiarBorrador();
        abrirPresupuestos('TODOS');
        if (id) {
          setTimeout(function () { abrirDetallePresupuesto(id); }, 350);
        }
      })
      .catch(function (error) { manejarError(error); })
      .finally(function () {
        estado.ocupado = false;
        deshabilitarResumen(false);
      });
  }

  function confirmarReprogramacion() {
    const datos = estado.reprogramar;
    if (!datos || estado.ocupado) return;

    estado.ocupado = true;
    deshabilitarResumen(true);
    indicador('Guardando cambio…');

    api('actividad.reprogramar', {
      actividad_id: datos.actividad_id,
      fecha: datos.fecha,
      hora: datos.hora,
      motivo: 'Reprogramada por voz',
      origen: 'VOZ',
      idempotencia: estado.idempotencia
    })
      .then(function (resultado) {
        const mensaje = resultado.repetido
          ? 'Ese cambio ya estaba guardado.'
          : 'Listo. La actividad quedó para el ' + fechaCorta(resultado.fecha) +
            ' a las ' + resultado.hora + '.';
        agregarMensaje('sistema', mensaje);
        hablar(mensaje);
        limpiarBorrador();
        if (estado.agendaDesde) {
          cargarAgenda(estado.agendaDesde, estado.agendaHasta, estado.agendaEtiqueta, false);
        }
      })
      .catch(function (error) { manejarError(error); })
      .finally(function () {
        estado.ocupado = false;
        deshabilitarResumen(false);
      });
  }

  function confirmarAnulacion() {
    const datos = estado.anular;
    if (!datos || estado.ocupado) return;

    estado.ocupado = true;
    deshabilitarResumen(true);
    indicador('Anulando…');

    api('actividad.anular', {
      actividad_id: datos.actividad_id,
      motivo: 'Anulada por voz'
    })
      .then(function () {
        const mensaje = 'Listo. La actividad quedó cancelada.';
        agregarMensaje('sistema', mensaje);
        hablar(mensaje);
        limpiarBorrador();
        if (estado.agendaDesde) {
          cargarAgenda(estado.agendaDesde, estado.agendaHasta, estado.agendaEtiqueta, false);
        }
      })
      .catch(function (error) { manejarError(error); })
      .finally(function () {
        estado.ocupado = false;
        deshabilitarResumen(false);
      });
  }

  function corregir() {
    if (estado.ocupado) return;

    if (estado.accionPendiente === 'reprogramar') {
      estado.resumen = null;
      estado.idempotencia = '';
      cerrarResumen();
      estado.accionPendiente = '';
      agregarMensaje('asistente', '¿Para qué fecha y hora la reprogramo?');
      indicador('Decí la nueva fecha y hora');
      hablar('¿Para qué fecha y hora la reprogramo?', iniciarEscucha);
      return;
    }

    if (estado.accionPendiente === 'anular') {
      estado.anular = null;
      estado.accionPendiente = '';
      estado.resumen = null;
      cerrarResumen();
      agregarMensaje('asistente', '¿Cuál querés anular?');
      indicador('Decime cuál querés anular');
      hablar('¿Cuál querés anular?', iniciarEscucha);
      return;
    }

    cerrarResumen();
    transcripcion('');
    indicador('Decime qué querés corregir');
    hablar('Decime qué querés corregir.', iniciarEscucha);
  }

  function cancelar() {
    if (estado.ocupado) return;
    limpiarBorrador();
    agregarMensaje('sistema', 'Cancelado. No se guardó nada.');
    indicador('Tocá el micrófono y hablá');
    hablar('Listo, cancelado.');
  }

  // -------------------------------------------------------------------------
  // Agenda
  // -------------------------------------------------------------------------

  function abrirAgenda(rango) {
    estado.agendaRango = rango || 'hoy';
    const hoy = fechaISO(new Date());
    let desde = hoy;
    let hasta = hoy;
    let etiqueta = 'hoy';

    if (estado.agendaRango === 'manana') {
      desde = sumarDiasISO(hoy, 1);
      hasta = desde;
      etiqueta = 'mañana';
    } else if (estado.agendaRango === 'semana') {
      hasta = sumarDiasISO(hoy, 6);
      etiqueta = 'esta semana';
    }

    document.querySelectorAll('.btn-filtro').forEach(function (boton) {
      boton.classList.toggle('activo', boton.getAttribute('data-rango') === estado.agendaRango);
    });

    irA('agenda');
    cargarAgenda(desde, hasta, etiqueta, true);
  }

  function abrirAgendaRango(rango) {
    estado.agendaRango = '';
    document.querySelectorAll('.btn-filtro').forEach(function (boton) {
      boton.classList.remove('activo');
    });
    irA('agenda');
    cargarAgenda(rango.desde, rango.hasta, rango.etiqueta, true);
  }

  function cargarAgenda(desde, hasta, etiqueta, hablarResumen) {
    estado.agendaDesde = desde;
    estado.agendaHasta = hasta;
    estado.agendaEtiqueta = etiqueta;
    estado.agendaItems = [];

    $('agenda-titulo').textContent = 'Actividades para ' + etiqueta;
    $('agenda-mensaje').textContent = 'Cargando…';
    $('agenda-mensaje').classList.remove('ok');
    $('agenda-lista').innerHTML = '';

    api('actividad.listar', { desde: desde, hasta: hasta })
      .then(function (items) {
        estado.agendaItems = items || [];
        $('agenda-mensaje').textContent = '';
        renderizarAgenda(estado.agendaItems, etiqueta);
        if (hablarResumen) hablar(resumenAgenda(estado.agendaItems, etiqueta));
      })
      .catch(function (error) {
        if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
          manejarError(error);
          return;
        }
        $('agenda-mensaje').textContent = error.message;
        hablar('No pude cargar la agenda. ' + error.message);
      });
  }

  function renderizarAgenda(items, etiqueta) {
    const lista = $('agenda-lista');
    lista.innerHTML = '';

    if (!items.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacio';
      vacio.textContent = 'No tenés actividades para ' + etiqueta + '.';
      lista.appendChild(vacio);
      return;
    }

    items.forEach(function (actividad) {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'agenda-item';

      const hora = document.createElement('div');
      hora.className = 'agenda-hora';
      hora.textContent = actividad.hora || '--:--';

      const cuerpo = document.createElement('div');
      cuerpo.className = 'agenda-cuerpo';

      const titulo = document.createElement('strong');
      titulo.textContent = tipoLegible(actividad.tipo);

      const detalle = document.createElement('p');
      detalle.textContent = actividad.cliente_nombre
        ? actividad.cliente_nombre + ' · ' + (actividad.motivo || '')
        : (actividad.motivo || 'Sin detalle');

      const meta = document.createElement('span');
      meta.className = 'agenda-meta';
      meta.textContent = fechaCorta(actividad.fecha) + ' · ' + (actividad.estado || '');

      cuerpo.appendChild(titulo);
      cuerpo.appendChild(detalle);
      cuerpo.appendChild(meta);

      const acciones = document.createElement('div');
      acciones.className = 'agenda-acciones';

      const reprogramar = document.createElement('button');
      reprogramar.type = 'button';
      reprogramar.className = 'btn-reprogramar';
      reprogramar.textContent = 'Reprogramar';
      reprogramar.addEventListener('click', function () { abrirDialogoReprogramar(actividad); });

      const anular = document.createElement('button');
      anular.type = 'button';
      anular.className = 'btn-anular';
      anular.textContent = 'Anular';
      anular.addEventListener('click', function () { anularDesdeAgenda(actividad); });

      acciones.appendChild(reprogramar);
      acciones.appendChild(anular);

      tarjeta.appendChild(hora);
      tarjeta.appendChild(cuerpo);
      tarjeta.appendChild(acciones);
      lista.appendChild(tarjeta);
    });
  }

  function abrirDialogoReprogramar(actividad) {
    estado.reprogramarDialogo = actividad;
    const detalle = tipoLegible(actividad.tipo) +
      (actividad.cliente_nombre ? ' con ' + actividad.cliente_nombre : '') +
      (actividad.motivo ? ' · ' + actividad.motivo : '');
    $('reprogramar-detalle').textContent = detalle;
    $('reprogramar-fecha').value = actividad.fecha || fechaISO(new Date());
    $('reprogramar-hora').value = actividad.hora || '09:00';

    const dialogo = $('dialogo-reprogramar');
    if (dialogo.showModal) {
      dialogo.showModal();
    } else {
      dialogo.setAttribute('open', 'open');
    }
  }

  function cerrarDialogoReprogramar() {
    const dialogo = $('dialogo-reprogramar');
    if (dialogo.close) {
      dialogo.close();
    } else {
      dialogo.removeAttribute('open');
    }
  }

  async function guardarReprogramacion(evento) {
    evento.preventDefault();
    const actividad = estado.reprogramarDialogo;
    if (!actividad) return;

    const fecha = $('reprogramar-fecha').value;
    const hora = $('reprogramar-hora').value;
    if (!fecha || !hora) {
      window.alert('Completá la fecha y la hora.');
      return;
    }

    const boton = $('form-reprogramar').querySelector('button[type="submit"]');
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      const resultado = await api('actividad.reprogramar', {
        actividad_id: actividad.actividad_id,
        fecha: fecha,
        hora: hora,
        motivo: 'Reprogramada desde la agenda',
        origen: 'MANUAL'
      });
      cerrarDialogoReprogramar();
      const mensaje = 'Actividad reprogramada para el ' +
        fechaCorta(resultado.fecha) + ' a las ' + resultado.hora + '.';
      agregarMensaje('sistema', mensaje);
      hablar('Listo. La actividad quedó reprogramada.');
      if (estado.agendaDesde) {
        cargarAgenda(estado.agendaDesde, estado.agendaHasta, estado.agendaEtiqueta, false);
      }
    } catch (error) {
      window.alert(error.message);
    } finally {
      boton.disabled = false;
      boton.textContent = 'Guardar cambio';
    }
  }

  function anularDesdeAgenda(actividad) {
    const referencia = actividad.motivo || actividad.actividad_id;
    const seguro = window.confirm('¿Anular «' + referencia + '»?\n\n' +
      'No se borra: queda marcada como cancelada.');
    if (!seguro) return;

    api('actividad.anular', {
      actividad_id: actividad.actividad_id,
      motivo: 'Anulada desde la agenda'
    })
      .then(function () {
        agregarMensaje('sistema', 'Actividad anulada.');
        hablar('Actividad anulada.');
        if (estado.agendaDesde) {
          cargarAgenda(estado.agendaDesde, estado.agendaHasta, estado.agendaEtiqueta, false);
        } else {
          abrirAgenda('hoy');
        }
      })
      .catch(function (error) {
        $('agenda-mensaje').textContent = error.message;
        hablar('No pude anular la actividad. ' + error.message);
      });
  }

  // -------------------------------------------------------------------------
  // Clientes y proveedores
  // -------------------------------------------------------------------------

  function abrirDirectorio(tipo) {
    estado.directorioTipo = tipo === 'proveedores' ? 'proveedores' : 'clientes';
    estado.directorioItems = [];
    estado.directorioSeleccion = null;
    $('buscar-directorio').value = '';
    cerrarDetalleDirectorio();
    actualizarTabsDirectorio();
    irA('directorio');
    cargarDirectorio();
  }

  function actualizarTabsDirectorio() {
    const esClientes = estado.directorioTipo === 'clientes';
    document.querySelectorAll('.directorio-tabs .btn-filtro').forEach(function (boton) {
      boton.classList.toggle('activo', boton.getAttribute('data-tipo') === estado.directorioTipo);
    });
    $('directorio-titulo').textContent = esClientes ? 'Clientes' : 'Proveedores';
    $('btn-nuevo-directorio').textContent = esClientes ? 'Nuevo cliente' : 'Nuevo proveedor';
    $('buscar-directorio').placeholder = esClientes
      ? 'Buscar cliente por nombre, teléfono o email'
      : 'Buscar proveedor por nombre, teléfono o email';
  }

  async function cargarDirectorio() {
    if (estado.directorioCargando) return;
    estado.directorioCargando = true;

    const esClientes = estado.directorioTipo === 'clientes';
    const texto = $('buscar-directorio').value.trim();
    $('directorio-mensaje').textContent = 'Cargando…';
    $('directorio-mensaje').classList.remove('ok');
    $('directorio-lista').innerHTML = '';

    try {
      const items = await api(esClientes ? 'cliente.buscar' : 'proveedor.buscar', { texto: texto });
      estado.directorioItems = items || [];
      renderizarDirectorio(estado.directorioItems);
    } catch (error) {
      $('directorio-mensaje').textContent = error.message;
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
      }
    } finally {
      estado.directorioCargando = false;
    }
  }

  function renderizarDirectorio(items) {
    const lista = $('directorio-lista');
    lista.innerHTML = '';
    const esClientes = estado.directorioTipo === 'clientes';

    if (!items.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacio';
      vacio.textContent = esClientes
        ? 'No encontré clientes con esa búsqueda.'
        : 'No encontré proveedores con esa búsqueda.';
      lista.appendChild(vacio);
      $('directorio-mensaje').textContent = '';
      return;
    }

    $('directorio-mensaje').textContent = items.length +
      (items.length === 1 ? ' registro.' : ' registros.');

    items.forEach(function (item) {
      const tarjeta = document.createElement('button');
      tarjeta.type = 'button';
      tarjeta.className = 'directorio-item';

      const nombre = document.createElement('strong');
      const meta = document.createElement('span');
      meta.className = 'directorio-meta';

      if (esClientes) {
        nombre.textContent = item.nombre_completo || item.nombre || item.cliente_id;
        const partes = [item.tipo || 'Cliente', item.telefono || 'Sin teléfono'];
        if (item.email) partes.push(item.email);
        meta.textContent = partes.join(' · ');
      } else {
        nombre.textContent = item.nombre_comercial || item.proveedor_id;
        const partes = [];
        if (item.contacto) partes.push(item.contacto);
        partes.push(item.telefono || 'Sin teléfono');
        if (item.materiales) partes.push(item.materiales);
        meta.textContent = partes.join(' · ');
      }

      const detalle = document.createElement('span');
      detalle.className = 'directorio-detalle-linea';
      const direccion = item.direccion || item.localidad || '';
      detalle.textContent = direccion || (item.observaciones || '');

      tarjeta.appendChild(nombre);
      tarjeta.appendChild(meta);
      if (detalle.textContent) tarjeta.appendChild(detalle);
      tarjeta.addEventListener('click', function () { abrirDetalleEntidad(item); });
      lista.appendChild(tarjeta);
    });
  }

  async function abrirDetalleEntidad(item) {
    if (!item) return;
    const esClientes = estado.directorioTipo === 'clientes';
    const id = esClientes ? item.cliente_id : item.proveedor_id;
    if (!id) return;

    estado.directorioSeleccion = item;
    const contenedor = $('directorio-detalle');
    contenedor.classList.remove('oculto');
    contenedor.innerHTML = '<p class="ayuda">Cargando historial…</p>';
    contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const datos = await api(esClientes ? 'cliente.historial' : 'proveedor.historial',
        esClientes ? { cliente_id: id } : { proveedor_id: id });
      renderizarDetalleDirectorio(datos);
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
        return;
      }
      contenedor.innerHTML = '';
      const mensaje = document.createElement('p');
      mensaje.className = 'mensaje-error';
      mensaje.textContent = error.message;
      contenedor.appendChild(mensaje);
    }
  }

  function renderizarDetalleDirectorio(datos) {
    const esClientes = estado.directorioTipo === 'clientes';
    const entidad = esClientes ? datos.cliente : datos.proveedor;
    if (!entidad) return;
    estado.directorioSeleccion = entidad;

    const contenedor = $('directorio-detalle');
    contenedor.innerHTML = '';

    const cabecera = document.createElement('div');
    cabecera.className = 'detalle-cabecera';

    const titulos = document.createElement('div');
    const titulo = document.createElement('h2');
    titulo.textContent = esClientes
      ? (entidad.nombre_completo || entidad.nombre || entidad.cliente_id)
      : (entidad.nombre_comercial || entidad.proveedor_id);
    const identificador = document.createElement('p');
    identificador.className = 'detalle-id';
    identificador.textContent = (esClientes ? entidad.cliente_id : entidad.proveedor_id) +
      ' · ' + (entidad.estado || '');
    titulos.appendChild(titulo);
    titulos.appendChild(identificador);

    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'btn-texto';
    cerrar.textContent = 'Cerrar';
    cerrar.addEventListener('click', cerrarDetalleDirectorio);

    cabecera.appendChild(titulos);
    cabecera.appendChild(cerrar);
    contenedor.appendChild(cabecera);

    const campos = document.createElement('div');
    campos.className = 'detalle-campos';
    if (esClientes) {
      agregarCampoDirectorio_(campos, 'Tipo', entidad.tipo);
      agregarCampoDirectorio_(campos, 'Teléfono', entidad.telefono);
      agregarCampoDirectorio_(campos, 'Email', entidad.email);
      agregarCampoDirectorio_(campos, 'Dirección', entidad.direccion);
      agregarCampoDirectorio_(campos, 'Localidad', entidad.localidad);
      agregarCampoDirectorio_(campos, 'Observaciones', entidad.observaciones);
    } else {
      agregarCampoDirectorio_(campos, 'Contacto', entidad.contacto);
      agregarCampoDirectorio_(campos, 'Teléfono', entidad.telefono);
      agregarCampoDirectorio_(campos, 'Email', entidad.email);
      agregarCampoDirectorio_(campos, 'Dirección', entidad.direccion);
      agregarCampoDirectorio_(campos, 'Materiales o servicios', entidad.materiales);
      agregarCampoDirectorio_(campos, 'Condiciones de pago', entidad.condiciones_pago);
      agregarCampoDirectorio_(campos, 'Observaciones', entidad.observaciones);
    }
    agregarCampoDirectorio_(campos, 'Alta', fechaHoraCorta(entidad.fecha_alta));
    contenedor.appendChild(campos);

    const acciones = document.createElement('div');
    acciones.className = 'detalle-acciones';

    if (esPropietario()) {
      const duplicados = document.createElement('button');
      duplicados.type = 'button';
      duplicados.className = 'btn-secundario';
      duplicados.textContent = 'Buscar duplicados';
      duplicados.addEventListener('click', abrirDialogoDuplicados);
      acciones.appendChild(duplicados);

      if (String(entidad.estado || '').toUpperCase() === 'ACTIVO') {
        const anular = document.createElement('button');
        anular.type = 'button';
        anular.className = 'btn-peligro';
        anular.textContent = 'Anular';
        anular.addEventListener('click', anularEntidadSeleccionada);
        acciones.appendChild(anular);
      }
    } else {
      const aviso = document.createElement('p');
      aviso.className = 'ayuda';
      aviso.textContent = 'Solo el propietario puede anular o fusionar registros.';
      acciones.appendChild(aviso);
    }
    contenedor.appendChild(acciones);

    const historialTitulo = document.createElement('h3');
    historialTitulo.textContent = 'Historial de actividades';
    contenedor.appendChild(historialTitulo);

    const resumen = datos.resumen || {};
    const resumenTexto = document.createElement('p');
    resumenTexto.className = 'detalle-resumen';
    resumenTexto.textContent = 'Total ' + (resumen.total || 0) +
      ' · Pendientes ' + (resumen.pendientes || 0) +
      ' · Realizadas ' + (resumen.realizadas || 0) +
      ' · Canceladas ' + (resumen.canceladas || 0);
    contenedor.appendChild(resumenTexto);

    const actividades = datos.actividades || [];
    if (!actividades.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacio';
      vacio.textContent = 'Todavía no hay actividades vinculadas.';
      contenedor.appendChild(vacio);
      return;
    }

    const historial = document.createElement('div');
    historial.className = 'historial-lista';
    actividades.forEach(function (actividad) {
      const item = document.createElement('div');
      item.className = 'historial-item';

      const linea = document.createElement('div');
      linea.className = 'historial-linea';
      const tipo = document.createElement('strong');
      tipo.textContent = tipoLegible(actividad.tipo);
      const fecha = document.createElement('span');
      fecha.textContent = fechaCorta(actividad.fecha) +
        (actividad.hora ? ' ' + actividad.hora : '');
      linea.appendChild(tipo);
      linea.appendChild(fecha);

      const motivo = document.createElement('p');
      motivo.textContent = actividad.motivo || 'Sin detalle';

      const meta = document.createElement('span');
      meta.className = 'historial-meta';
      meta.textContent = (actividad.estado || '') +
        (actividad.origen ? ' · ' + actividad.origen : '');

      item.appendChild(linea);
      item.appendChild(motivo);
      item.appendChild(meta);
      historial.appendChild(item);
    });
    contenedor.appendChild(historial);
  }

  function agregarCampoDirectorio_(contenedor, etiqueta, valor) {
    const campo = document.createElement('div');
    campo.className = 'detalle-campo';
    const nombre = document.createElement('span');
    nombre.textContent = etiqueta;
    const dato = document.createElement('strong');
    dato.textContent = valor || '—';
    campo.appendChild(nombre);
    campo.appendChild(dato);
    contenedor.appendChild(campo);
  }

  function cerrarDetalleDirectorio() {
    estado.directorioSeleccion = null;
    const contenedor = $('directorio-detalle');
    contenedor.innerHTML = '';
    contenedor.classList.add('oculto');
  }

  function esPropietario() {
    return String((estado.usuario && estado.usuario.rol) || '').toUpperCase() === 'PROPIETARIO';
  }

  function abrirFormularioEntidad() {
    const esClientes = estado.directorioTipo === 'clientes';
    $('entidad-titulo').textContent = esClientes ? 'Nuevo cliente' : 'Nuevo proveedor';
    $('campos-cliente').classList.toggle('oculto', !esClientes);
    $('campos-proveedor').classList.toggle('oculto', esClientes);
    $('cliente-nombre').required = esClientes;
    $('proveedor-nombre').required = !esClientes;
    limpiarFormularioEntidad();
    entidadMensaje('');
    mostrarDialogo_('dialogo-entidad');
    setTimeout(function () {
      if (esClientes) $('cliente-nombre').focus();
      else $('proveedor-nombre').focus();
    }, 50);
  }

  function limpiarFormularioEntidad() {
    [
      'cliente-nombre', 'cliente-apellido', 'cliente-telefono', 'cliente-email',
      'cliente-direccion', 'cliente-localidad', 'cliente-observaciones',
      'proveedor-nombre', 'proveedor-contacto', 'proveedor-telefono', 'proveedor-email',
      'proveedor-direccion', 'proveedor-materiales', 'proveedor-condiciones',
      'proveedor-observaciones'
    ].forEach(function (id) {
      const nodo = $(id);
      if (nodo) nodo.value = '';
    });
    $('cliente-tipo').value = 'PARTICULAR';
  }

  function cerrarFormularioEntidad() {
    entidadMensaje('');
    ocultarDialogo_('dialogo-entidad');
  }

  function entidadMensaje(texto) {
    $('entidad-mensaje').textContent = texto || '';
  }

  async function guardarEntidad(evento) {
    evento.preventDefault();
    const esClientes = estado.directorioTipo === 'clientes';
    const boton = $('btn-entidad-guardar');

    const datos = esClientes ? {
      nombre: $('cliente-nombre').value.trim(),
      apellido: $('cliente-apellido').value.trim(),
      tipo: $('cliente-tipo').value,
      telefono: $('cliente-telefono').value.trim(),
      email: $('cliente-email').value.trim(),
      direccion: $('cliente-direccion').value.trim(),
      localidad: $('cliente-localidad').value.trim(),
      observaciones: $('cliente-observaciones').value.trim()
    } : {
      nombre_comercial: $('proveedor-nombre').value.trim(),
      contacto: $('proveedor-contacto').value.trim(),
      telefono: $('proveedor-telefono').value.trim(),
      email: $('proveedor-email').value.trim(),
      direccion: $('proveedor-direccion').value.trim(),
      materiales: $('proveedor-materiales').value.trim(),
      condiciones_pago: $('proveedor-condiciones').value.trim(),
      observaciones: $('proveedor-observaciones').value.trim()
    };

    if (esClientes && !datos.nombre) {
      entidadMensaje('Escribí el nombre del cliente.');
      return;
    }
    if (!esClientes && !datos.nombre_comercial) {
      entidadMensaje('Escribí el nombre comercial del proveedor.');
      return;
    }

    entidadMensaje('');
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    function enviar(forzar) {
      const cuerpo = {};
      cuerpo[esClientes ? 'cliente' : 'proveedor'] = Object.assign({}, datos);
      if (forzar) cuerpo[esClientes ? 'cliente' : 'proveedor'].forzar = true;
      return api(esClientes ? 'cliente.crear' : 'proveedor.crear', cuerpo);
    }

    try {
      let resultado;
      try {
        resultado = await enviar(false);
      } catch (error) {
        if (error.codigo !== 'DUPLICADO' ||
            !window.confirm(error.message + '\n\n¿Querés guardarlo igual?')) {
          throw error;
        }
        resultado = await enviar(true);
      }

      cerrarFormularioEntidad();
      if (!esClientes) estado.proveedoresFormularioCargados = false;
      $('buscar-directorio').value = '';
      await cargarDirectorio();
      $('directorio-mensaje').textContent = esClientes
        ? 'Cliente guardado.'
        : 'Proveedor guardado.';
      $('directorio-mensaje').classList.add('ok');
      abrirDetalleEntidad(esClientes
        ? { cliente_id: resultado.cliente_id }
        : { proveedor_id: resultado.proveedor_id });
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
      } else {
        entidadMensaje(error.message);
      }
    } finally {
      boton.disabled = false;
      boton.textContent = 'Guardar';
    }
  }

  function buscarDirectorio(evento) {
    evento.preventDefault();
    cerrarDetalleDirectorio();
    cargarDirectorio();
  }

  async function abrirDialogoDuplicados() {
    const entidad = estado.directorioSeleccion;
    if (!entidad) return;
    const esClientes = estado.directorioTipo === 'clientes';
    const id = esClientes ? entidad.cliente_id : entidad.proveedor_id;
    if (!id) return;

    $('duplicados-detalle').textContent = 'Buscando coincidencias…';
    $('duplicados-lista').innerHTML = '';
    mostrarDialogo_('dialogo-duplicados');

    try {
      const items = await api(esClientes ? 'cliente.duplicados' : 'proveedor.duplicados',
        esClientes ? { cliente_id: id } : { proveedor_id: id });
      renderizarDuplicados(items || [], entidad);
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        cerrarDialogoDuplicados();
        manejarError(error);
        return;
      }
      $('duplicados-detalle').textContent = error.message;
    }
  }

  function renderizarDuplicados(items, actual) {
    const lista = $('duplicados-lista');
    lista.innerHTML = '';
    const esClientes = estado.directorioTipo === 'clientes';

    if (!items.length) {
      $('duplicados-detalle').textContent = 'No encontré registros parecidos.';
      return;
    }

    $('duplicados-detalle').textContent =
      'Elegí cuál se conserva. El otro queda como FUSIONADO y no se borra.';

    items.forEach(function (item) {
      const candidato = esClientes ? item.cliente : item.proveedor;
      if (!candidato) return;

      const tarjeta = document.createElement('div');
      tarjeta.className = 'duplicado-item';

      const nombre = document.createElement('strong');
      nombre.textContent = nombreEntidadDirectorio_(candidato, esClientes);

      const motivos = document.createElement('p');
      motivos.className = 'duplicado-motivos';
      motivos.textContent = 'Coincide por: ' + (item.coincidencias || [])
        .map(motivoLegible).join(', ');

      const datos = document.createElement('span');
      datos.className = 'duplicado-datos';
      datos.textContent = [candidato.telefono, candidato.email, candidato.direccion]
        .filter(function (v) { return !!v; }).join(' · ');

      const acciones = document.createElement('div');
      acciones.className = 'duplicado-acciones';

      const conservarActual = document.createElement('button');
      conservarActual.type = 'button';
      conservarActual.className = 'btn-secundario';
      conservarActual.textContent = 'Conservar el actual';
      conservarActual.addEventListener('click', function () {
        fusionarEntidades(actual, candidato);
      });

      const conservarCandidato = document.createElement('button');
      conservarCandidato.type = 'button';
      conservarCandidato.className = 'btn-secundario';
      conservarCandidato.textContent = 'Conservar este';
      conservarCandidato.addEventListener('click', function () {
        fusionarEntidades(candidato, actual);
      });

      acciones.appendChild(conservarActual);
      acciones.appendChild(conservarCandidato);

      tarjeta.appendChild(nombre);
      tarjeta.appendChild(motivos);
      if (datos.textContent) tarjeta.appendChild(datos);
      tarjeta.appendChild(acciones);
      lista.appendChild(tarjeta);
    });
  }

  async function fusionarEntidades(principal, duplicado) {
    const esClientes = estado.directorioTipo === 'clientes';
    const principalId = esClientes ? principal.cliente_id : principal.proveedor_id;
    const duplicadoId = esClientes ? duplicado.cliente_id : duplicado.proveedor_id;
    if (!principalId || !duplicadoId) return;

    const nombrePrincipal = nombreEntidadDirectorio_(principal, esClientes);
    const nombreDuplicado = nombreEntidadDirectorio_(duplicado, esClientes);
    const seguro = window.confirm('¿Fusionar «' + nombreDuplicado + '» en «' +
      nombrePrincipal + '»?\n\nSe conserva «' + nombrePrincipal + '», se mueve el ' +
      'historial del otro y el duplicado queda marcado como FUSIONADO. No se borra nada.');
    if (!seguro) return;

    try {
      await api(esClientes ? 'cliente.fusionar' : 'proveedor.fusionar', {
        principal_id: principalId,
        duplicado_id: duplicadoId
      });
      cerrarDialogoDuplicados();
      await cargarDirectorio();
      $('directorio-mensaje').textContent = 'Fusión guardada.';
      $('directorio-mensaje').classList.add('ok');
      abrirDetalleEntidad(principal);
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        cerrarDialogoDuplicados();
        manejarError(error);
      } else {
        window.alert(error.message);
      }
    }
  }

  function nombreEntidadDirectorio_(entidad, esClientes) {
    if (!entidad) return '';
    return esClientes
      ? (entidad.nombre_completo || entidad.nombre || entidad.cliente_id || '')
      : (entidad.nombre_comercial || entidad.proveedor_id || '');
  }

  function motivoLegible(motivo) {
    const nombres = {
      telefono: 'teléfono',
      email: 'email',
      nombre: 'nombre'
    };
    return nombres[String(motivo || '').toLowerCase()] || motivo;
  }

  function cerrarDialogoDuplicados() {
    ocultarDialogo_('dialogo-duplicados');
  }

  async function anularEntidadSeleccionada() {
    const entidad = estado.directorioSeleccion;
    if (!entidad || !esPropietario()) return;
    const esClientes = estado.directorioTipo === 'clientes';
    const id = esClientes ? entidad.cliente_id : entidad.proveedor_id;
    const nombre = nombreEntidadDirectorio_(entidad, esClientes);
    if (!id) return;

    const seguro = window.confirm('¿Anular «' + nombre + '»?\n\n' +
      'No se borra: queda marcado como ANULADO.');
    if (!seguro) return;

    try {
      const cuerpo = { motivo: 'Anulada desde la pantalla' };
      cuerpo[esClientes ? 'cliente_id' : 'proveedor_id'] = id;
      await api(esClientes ? 'cliente.anular' : 'proveedor.anular', cuerpo);
      cerrarDetalleDirectorio();
      await cargarDirectorio();
      $('directorio-mensaje').textContent = esClientes
        ? 'Cliente anulado.'
        : 'Proveedor anulado.';
      $('directorio-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
      } else {
        window.alert(error.message);
      }
    }
  }

  function abrirPresupuestos(filtro) {
    if (filtro !== undefined) {
      const nuevo = String(filtro || 'TODOS').toUpperCase();
      estado.presupuestosEstado = nuevo || 'TODOS';
    }
    estado.presupuestosItems = [];
    estado.presupuestoActual = null;
    $('buscar-presupuesto').value = '';
    cerrarDetallePresupuesto();
    actualizarFiltrosPresupuestos();
    irA('presupuestos');
    cargarPresupuestos();
  }

  function actualizarFiltrosPresupuestos() {
    document.querySelectorAll('.presupuestos-filtros .btn-filtro').forEach(function (boton) {
      boton.classList.toggle('activo',
        boton.getAttribute('data-estado') === estado.presupuestosEstado);
    });
    const titulos = {
      TODOS: 'Todos los presupuestos',
      PENDIENTE: 'Presupuestos pendientes',
      ENVIADO: 'Presupuestos enviados',
      ACEPTADO: 'Presupuestos aceptados',
      RECHAZADO: 'Presupuestos rechazados',
      VENCIDO: 'Presupuestos vencidos',
      ANULADO: 'Presupuestos anulados'
    };
    $('presupuestos-titulo').textContent =
      titulos[estado.presupuestosEstado] || titulos.TODOS;
  }

  async function cargarPresupuestos() {
    if (estado.presupuestosCargando) return;
    estado.presupuestosCargando = true;

    const texto = $('buscar-presupuesto').value.trim();
    const datos = { texto: texto };
    if (estado.presupuestosEstado !== 'TODOS') {
      datos.estado = estado.presupuestosEstado;
    }

    $('presupuestos-mensaje').textContent = 'Cargando…';
    $('presupuestos-mensaje').classList.remove('ok');
    $('presupuestos-lista').innerHTML = '';

    try {
      const items = await api('presupuesto.buscar', datos);
      estado.presupuestosItems = items || [];
      renderizarPresupuestos(estado.presupuestosItems);
    } catch (error) {
      $('presupuestos-mensaje').textContent = error.message;
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
      }
    } finally {
      estado.presupuestosCargando = false;
    }
  }

  function renderizarPresupuestos(items) {
    const lista = $('presupuestos-lista');
    lista.innerHTML = '';

    if (!items.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacio';
      vacio.textContent = estado.presupuestosEstado === 'TODOS'
        ? 'Todavía no hay presupuestos cargados.'
        : 'No encontré presupuestos con ese filtro.';
      lista.appendChild(vacio);
      $('presupuestos-mensaje').textContent = '';
      return;
    }

    $('presupuestos-mensaje').textContent = items.length +
      (items.length === 1 ? ' presupuesto.' : ' presupuestos.');

    items.forEach(function (presupuesto) {
      const tarjeta = document.createElement('button');
      tarjeta.type = 'button';
      tarjeta.className = 'presupuesto-item';

      const superior = document.createElement('div');
      superior.className = 'presupuesto-item-superior';

      const identificador = document.createElement('strong');
      identificador.textContent = presupuesto.presupuesto_id || 'Presupuesto';

      const estadoNodo = document.createElement('span');
      estadoNodo.className = 'presupuesto-estado ' +
        estadoPresupuestoClase_(presupuesto.estado);
      estadoNodo.textContent = estadoPresupuestoLegible_(presupuesto.estado);

      superior.appendChild(identificador);
      superior.appendChild(estadoNodo);

      const cliente = document.createElement('span');
      cliente.className = 'presupuesto-cliente';
      cliente.textContent = presupuesto.cliente_nombre || presupuesto.cliente_id || 'Sin cliente';

      const descripcion = document.createElement('span');
      descripcion.className = 'presupuesto-descripcion';
      descripcion.textContent = presupuesto.descripcion || 'Sin descripción';

      const meta = document.createElement('span');
      meta.className = 'presupuesto-meta';
      const partes = [
        tipoInstalacionLegible_(presupuesto.tipo_instalacion),
        'Solicitud ' + fechaCorta(presupuesto.fecha_solicitud)
      ];
      if (presupuesto.fecha_seguimiento) {
        partes.push('Seguimiento ' + fechaCorta(presupuesto.fecha_seguimiento));
      }
      if (presupuesto.vencido) {
        partes.push('Vencido');
      } else if (presupuesto.estado === 'ENVIADO' &&
                 presupuesto.dias_para_vencer !== null &&
                 presupuesto.dias_para_vencer >= 0 &&
                 presupuesto.dias_para_vencer <= 3) {
        partes.push('Vence en ' + presupuesto.dias_para_vencer +
          (presupuesto.dias_para_vencer === 1 ? ' día' : ' días'));
      }
      meta.textContent = partes.join(' · ');

      const total = document.createElement('span');
      total.className = 'presupuesto-total';
      total.textContent = monedaPresupuesto_(presupuesto.total);

      tarjeta.appendChild(superior);
      tarjeta.appendChild(cliente);
      tarjeta.appendChild(descripcion);
      tarjeta.appendChild(meta);
      tarjeta.appendChild(total);
      tarjeta.addEventListener('click', function () {
        abrirDetallePresupuesto(presupuesto.presupuesto_id);
      });
      lista.appendChild(tarjeta);
    });
  }

  async function abrirDetallePresupuesto(id) {
    if (!id) return;

    estado.presupuestoActual = null;
    const contenedor = $('presupuesto-detalle');
    contenedor.classList.remove('oculto');
    contenedor.innerHTML = '<p class="ayuda">Cargando presupuesto…</p>';
    contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const datos = await api('presupuesto.historial', { presupuesto_id: id });
      renderizarDetallePresupuesto(datos);
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
        return;
      }
      contenedor.innerHTML = '';
      const mensaje = document.createElement('p');
      mensaje.className = 'mensaje-error';
      mensaje.textContent = error.message;
      contenedor.appendChild(mensaje);
    }
  }

  function renderizarDetallePresupuesto(datos) {
    if (!datos || !datos.presupuesto) return;
    const presupuesto = datos.presupuesto;
    const items = datos.items || [];
    const puedeEditar = ['PENDIENTE', 'ENVIADO'].indexOf(presupuesto.estado) !== -1;
    estado.presupuestoActual = datos;

    const contenedor = $('presupuesto-detalle');
    contenedor.innerHTML = '';

    const cabecera = document.createElement('div');
    cabecera.className = 'detalle-cabecera';

    const titulos = document.createElement('div');
    const titulo = document.createElement('h2');
    titulo.textContent = presupuesto.cliente_nombre || presupuesto.cliente_id;
    const identificador = document.createElement('p');
    identificador.className = 'detalle-id';
    identificador.textContent = presupuesto.presupuesto_id + ' · ' +
      estadoPresupuestoLegible_(presupuesto.estado);
    titulos.appendChild(titulo);
    titulos.appendChild(identificador);

    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'btn-texto';
    cerrar.textContent = 'Cerrar';
    cerrar.addEventListener('click', cerrarDetallePresupuesto);

    cabecera.appendChild(titulos);
    cabecera.appendChild(cerrar);
    contenedor.appendChild(cabecera);

    const total = document.createElement('p');
    total.className = 'presupuesto-total-detalle';
    total.textContent = monedaPresupuesto_(presupuesto.total) +
      (presupuesto.estado === 'ENVIADO' && presupuesto.fecha_vencimiento
        ? ' · Vence ' + fechaCorta(presupuesto.fecha_vencimiento)
        : '');
    contenedor.appendChild(total);

    const campos = document.createElement('div');
    campos.className = 'detalle-campos';
    agregarCampoDirectorio_(campos, 'Cliente', presupuesto.cliente_nombre);
    agregarCampoDirectorio_(campos, 'Teléfono', presupuesto.cliente_telefono);
    agregarCampoDirectorio_(campos, 'Dirección del cliente', presupuesto.cliente_direccion);
    agregarCampoDirectorio_(campos, 'Dirección del trabajo',
      presupuesto.direccion_trabajo || presupuesto.cliente_direccion);
    agregarCampoDirectorio_(campos, 'Instalación', tipoInstalacionLegible_(presupuesto.tipo_instalacion));
    agregarCampoDirectorio_(campos, 'Descripción', presupuesto.descripcion);
    agregarCampoDirectorio_(campos, 'Solicitud', fechaCorta(presupuesto.fecha_solicitud));
    agregarCampoDirectorio_(campos, 'Envío', fechaCorta(presupuesto.fecha_envio));
    agregarCampoDirectorio_(campos, 'Validez', presupuesto.validez_dias + ' días');
    agregarCampoDirectorio_(campos, 'Seguimiento', fechaCorta(presupuesto.fecha_seguimiento));
    agregarCampoDirectorio_(campos, 'Observaciones', presupuesto.observaciones);
    contenedor.appendChild(campos);

    const acciones = document.createElement('div');
    acciones.className = 'detalle-acciones presupuesto-acciones';

    if (puedeEscribir()) {
      if (puedeEditar) {
        agregarAccionPresupuesto_(acciones, 'Editar', 'btn-secundario', function () {
          abrirFormularioPresupuesto(presupuesto);
        });
        agregarAccionPresupuesto_(acciones, 'Agregar ítem', 'btn-secundario', function () {
          abrirFormularioItemPresupuesto();
        });
      }

      if (presupuesto.estado === 'PENDIENTE') {
        agregarAccionPresupuesto_(acciones, 'Marcar enviado', 'btn-secundario', function () {
          cambiarEstadoPresupuesto('ENVIADO');
        });
        agregarAccionPresupuesto_(acciones, 'Aceptar', 'btn-principal', function () {
          cambiarEstadoPresupuesto('ACEPTADO');
        });
        agregarAccionPresupuesto_(acciones, 'Rechazar', 'btn-peligro', function () {
          cambiarEstadoPresupuesto('RECHAZADO');
        });
      } else if (presupuesto.estado === 'ENVIADO') {
        agregarAccionPresupuesto_(acciones, 'Aceptar', 'btn-principal', function () {
          cambiarEstadoPresupuesto('ACEPTADO');
        });
        agregarAccionPresupuesto_(acciones, 'Rechazar', 'btn-peligro', function () {
          cambiarEstadoPresupuesto('RECHAZADO');
        });
        agregarAccionPresupuesto_(acciones, 'Marcar vencido', 'btn-secundario', function () {
          cambiarEstadoPresupuesto('VENCIDO');
        });
      } else if (presupuesto.estado === 'VENCIDO') {
        agregarAccionPresupuesto_(acciones, 'Volver a enviar', 'btn-secundario', function () {
          cambiarEstadoPresupuesto('ENVIADO');
        });
      }
    }

    if (esPropietario() &&
        ['PENDIENTE', 'ENVIADO', 'VENCIDO'].indexOf(presupuesto.estado) !== -1) {
      agregarAccionPresupuesto_(acciones, 'Anular', 'btn-peligro', function () {
        cambiarEstadoPresupuesto('ANULADO');
      });
    }

    if (!puedeEscribir()) {
      const aviso = document.createElement('p');
      aviso.className = 'ayuda';
      aviso.textContent = 'Solo lectura: no podés modificar presupuestos.';
      acciones.appendChild(aviso);
    }
    contenedor.appendChild(acciones);

    const itemsTitulo = document.createElement('h3');
    itemsTitulo.textContent = 'Ítems';
    contenedor.appendChild(itemsTitulo);

    if (!items.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacio';
      vacio.textContent = 'El presupuesto todavía no tiene ítems.';
      contenedor.appendChild(vacio);
    } else {
      const listaItems = document.createElement('div');
      listaItems.className = 'presupuesto-items';
      items.forEach(function (item) {
        listaItems.appendChild(crearLineaItemPresupuesto_(item, puedeEditar));
      });
      contenedor.appendChild(listaItems);
    }

    const seguimientoTitulo = document.createElement('h3');
    seguimientoTitulo.textContent = 'Seguimiento';
    contenedor.appendChild(seguimientoTitulo);

    if (datos.seguimiento) {
      const seguimiento = document.createElement('p');
      seguimiento.className = 'presupuesto-seguimiento';
      seguimiento.textContent = fechaCorta(datos.seguimiento.fecha) +
        ' ' + datos.seguimiento.hora + ' · ' + estadoActividadLegible_(datos.seguimiento.estado);
      contenedor.appendChild(seguimiento);
    } else {
      const sinSeguimiento = document.createElement('p');
      sinSeguimiento.className = 'ayuda';
      sinSeguimiento.textContent = 'No hay un seguimiento pendiente.';
      contenedor.appendChild(sinSeguimiento);
    }

    if (datos.trabajo) {
      const trabajoTitulo = document.createElement('h3');
      trabajoTitulo.textContent = 'Trabajo generado';
      contenedor.appendChild(trabajoTitulo);

      const trabajo = document.createElement('p');
      trabajo.className = 'presupuesto-trabajo';
      trabajo.textContent = datos.trabajo.trabajo_id + ' · ' +
        estadoActividadLegible_(datos.trabajo.estado) + ' · ' +
        monedaPresupuesto_(datos.trabajo.importe_presupuestado);
      contenedor.appendChild(trabajo);
    }

    const historialTitulo = document.createElement('h3');
    historialTitulo.textContent = 'Historial de cambios';
    contenedor.appendChild(historialTitulo);

    const historial = datos.historial || [];
    if (!historial.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacio';
      vacio.textContent = 'Todavía no hay cambios registrados.';
      contenedor.appendChild(vacio);
      return;
    }

    const listaHistorial = document.createElement('div');
    listaHistorial.className = 'historial-lista';
    historial.slice(0, 30).forEach(function (log) {
      const item = document.createElement('div');
      item.className = 'historial-item';

      const linea = document.createElement('div');
      linea.className = 'historial-linea';
      const accion = document.createElement('strong');
      accion.textContent = accionPresupuestoLegible_(log.accion);
      const fecha = document.createElement('span');
      fecha.textContent = fechaHoraCorta(log.fecha);
      linea.appendChild(accion);
      linea.appendChild(fecha);

      const detalle = document.createElement('p');
      detalle.textContent = resumenDetalleLogPresupuesto_(log.detalle);

      const meta = document.createElement('span');
      meta.className = 'historial-meta';
      meta.textContent = (log.usuario || '') + (log.origen ? ' · ' + log.origen : '');

      item.appendChild(linea);
      if (detalle.textContent) item.appendChild(detalle);
      item.appendChild(meta);
      listaHistorial.appendChild(item);
    });
    contenedor.appendChild(listaHistorial);
  }

  function crearLineaItemPresupuesto_(item, puedeEditar) {
    const linea = document.createElement('div');
    linea.className = 'presupuesto-item-linea' +
      (item.estado === 'ANULADO' ? ' anulado' : '');

    const cuerpo = document.createElement('div');
    cuerpo.className = 'presupuesto-item-cuerpo';

    const descripcion = document.createElement('strong');
    descripcion.textContent = item.descripcion;

    const meta = document.createElement('span');
    meta.className = 'presupuesto-item-meta';
    meta.textContent = tipoItemPresupuestoLegible_(item.tipo) + ' · ' +
      item.cantidad + ' ' + item.unidad + ' × ' +
      monedaPresupuesto_(item.precio_unitario) +
      (item.estado === 'ANULADO' ? ' · ANULADO' : '');

    cuerpo.appendChild(descripcion);
    cuerpo.appendChild(meta);

    const subtotal = document.createElement('span');
    subtotal.className = 'presupuesto-item-subtotal';
    subtotal.textContent = monedaPresupuesto_(item.subtotal);

    const acciones = document.createElement('div');
    acciones.className = 'presupuesto-item-acciones';
    if (puedeEditar && puedeEscribir() && item.estado !== 'ANULADO') {
      const editar = document.createElement('button');
      editar.type = 'button';
      editar.className = 'btn-reprogramar';
      editar.textContent = 'Editar';
      editar.addEventListener('click', function () {
        abrirFormularioItemPresupuesto(item);
      });

      const anular = document.createElement('button');
      anular.type = 'button';
      anular.className = 'btn-anular';
      anular.textContent = 'Anular';
      anular.addEventListener('click', function () {
        anularItemPresupuesto(item);
      });

      acciones.appendChild(editar);
      acciones.appendChild(anular);
    }

    linea.appendChild(cuerpo);
    linea.appendChild(subtotal);
    if (acciones.childNodes.length) linea.appendChild(acciones);
    return linea;
  }

  function agregarAccionPresupuesto_(contenedor, texto, clase, accion) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = clase;
    boton.textContent = texto;
    boton.addEventListener('click', accion);
    contenedor.appendChild(boton);
  }

  async function abrirFormularioPresupuesto(presupuesto) {
    const edicion = !!(presupuesto && presupuesto.presupuesto_id);
    const hoy = fechaISO(new Date());
    estado.presupuestoForm = edicion ? presupuesto : null;

    $('presupuesto-form-titulo').textContent = edicion
      ? 'Editar presupuesto'
      : 'Nuevo presupuesto';
    $('presupuesto-form-mensaje').textContent = '';
    $('presupuesto-fecha-solicitud').value = edicion
      ? (presupuesto.fecha_solicitud || hoy)
      : hoy;
    $('presupuesto-fecha-envio').value = edicion
      ? (presupuesto.fecha_envio || '')
      : '';
    $('presupuesto-seguimiento').value = edicion
      ? (presupuesto.fecha_seguimiento || '')
      : sumarDiasISO(hoy, DIAS_SEGUIMIENTO_PRESUPUESTO);
    $('presupuesto-validez').value = edicion
      ? (presupuesto.validez_dias || VALIDEZ_DIAS_PRESUPUESTO)
      : VALIDEZ_DIAS_PRESUPUESTO;
    $('presupuesto-tipo').value = edicion
      ? (presupuesto.tipo_instalacion || 'SERVICIO')
      : 'SERVICIO';
    $('presupuesto-descripcion').value = edicion
      ? (presupuesto.descripcion || '')
      : '';
    $('presupuesto-direccion-trabajo').value = edicion
      ? (presupuesto.direccion_trabajo || '')
      : '';
    $('presupuesto-importe').value = '';
    $('presupuesto-importe-campo').classList.toggle('oculto', edicion);
    $('presupuesto-observaciones').value = edicion
      ? (presupuesto.observaciones || '')
      : '';

    const select = $('presupuesto-cliente');
    select.innerHTML = '<option value="">Cargando clientes…</option>';
    mostrarDialogo_('dialogo-presupuesto');

    try {
      const clientes = await api('cliente.buscar', { texto: '' });
      estado.clientesFormulario = clientes || [];
    } catch (error) {
      estado.clientesFormulario = [];
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        cerrarFormularioPresupuesto();
        manejarError(error);
        return;
      }
      $('presupuesto-form-mensaje').textContent = error.message;
    }

    const lista = (estado.clientesFormulario || []).slice();
    if (edicion && presupuesto.cliente_id &&
        !lista.some(function (cliente) { return cliente.cliente_id === presupuesto.cliente_id; })) {
      lista.unshift({
        cliente_id: presupuesto.cliente_id,
        nombre_completo: presupuesto.cliente_nombre || presupuesto.cliente_id
      });
    }

    select.innerHTML = '';
    if (!lista.length) {
      const opcion = document.createElement('option');
      opcion.value = '';
      opcion.textContent = 'No hay clientes activos';
      select.appendChild(opcion);
    } else {
      lista.forEach(function (cliente) {
        const opcion = document.createElement('option');
        opcion.value = cliente.cliente_id;
        opcion.textContent = cliente.nombre_completo || cliente.cliente_id;
        select.appendChild(opcion);
      });
      select.value = edicion ? presupuesto.cliente_id : lista[0].cliente_id;
    }
    actualizarDireccionTrabajoSugerida_(!edicion);
    setTimeout(function () { $('presupuesto-descripcion').focus(); }, 50);
  }

  function direccionTrabajoCliente_() {
    const id = $('presupuesto-cliente').value;
    const cliente = (estado.clientesFormulario || []).filter(function (c) {
      return c.cliente_id === id;
    })[0];
    return cliente ? String(cliente.direccion || '').trim() : '';
  }

  function direccionTrabajoValida_(direccion) {
    const texto = String(direccion || '').trim();
    if (!texto) return false;
    return !/^\d{1,2}\/\d{1,2}\/\d{1,4}\s+\d{1,2}:\d{2}(:\d{2})?$/.test(texto);
  }

  function actualizarDireccionTrabajoSugerida_(rellenar) {
    const campo = $('presupuesto-direccion-trabajo');
    const original = direccionTrabajoCliente_();
    const sugerida = direccionTrabajoValida_(original) ? original : '';
    const anterior = campo.getAttribute('data-sugerida') || '';

    if (rellenar && (!campo.value || campo.value === anterior)) {
      campo.value = sugerida;
    }
    campo.setAttribute('data-sugerida', sugerida);
    campo.placeholder = sugerida
      ? 'Ej. ' + sugerida
      : (original ? 'Corregí la dirección del trabajo' : 'Escribí la dirección del trabajo');
  }

  function cerrarFormularioPresupuesto() {
    estado.presupuestoForm = null;
    $('presupuesto-form-mensaje').textContent = '';
    ocultarDialogo_('dialogo-presupuesto');
  }

  async function guardarPresupuesto(evento) {
    evento.preventDefault();
    const boton = $('btn-presupuesto-guardar');
    const edicion = estado.presupuestoForm;
    const entrada = {
      cliente_id: $('presupuesto-cliente').value,
      direccion_trabajo: $('presupuesto-direccion-trabajo').value.trim(),
      fecha_solicitud: $('presupuesto-fecha-solicitud').value,
      fecha_envio: $('presupuesto-fecha-envio').value,
      fecha_seguimiento: $('presupuesto-seguimiento').value,
      tipo_instalacion: $('presupuesto-tipo').value,
      descripcion: $('presupuesto-descripcion').value.trim(),
      validez_dias: Number($('presupuesto-validez').value),
      observaciones: $('presupuesto-observaciones').value.trim()
    };
    const importe = Number($('presupuesto-importe').value) || 0;

    if (!entrada.cliente_id) {
      $('presupuesto-form-mensaje').textContent = 'Elegí un cliente.';
      return;
    }
    if (!entrada.descripcion) {
      $('presupuesto-form-mensaje').textContent = 'Escribí una descripción.';
      return;
    }
    if (!entrada.direccion_trabajo && !direccionTrabajoValida_(direccionTrabajoCliente_())) {
      $('presupuesto-form-mensaje').textContent =
        'Escribí la dirección del trabajo: la del cliente está vacía o no es válida.';
      return;
    }
    if (importe < 0) {
      $('presupuesto-form-mensaje').textContent = 'El monto no es válido.';
      return;
    }
    if (!edicion && importe > 0) {
      entrada.items = [{
        tipo: 'OTRO',
        descripcion: entrada.descripcion.slice(0, 300),
        cantidad: 1,
        unidad: 'GLOBAL',
        precio_unitario: importe
      }];
    }
    if (edicion) entrada.presupuesto_id = edicion.presupuesto_id;

    $('presupuesto-form-mensaje').textContent = '';
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      const resultado = await api(
        edicion ? 'presupuesto.actualizar' : 'presupuesto.crear',
        { presupuesto: entrada }
      );
      cerrarFormularioPresupuesto();
      await cargarPresupuestos();
      renderizarDetallePresupuesto(resultado);
      $('presupuestos-mensaje').textContent = edicion
        ? 'Presupuesto actualizado.'
        : 'Presupuesto creado.';
      $('presupuestos-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        cerrarFormularioPresupuesto();
        manejarError(error);
      } else {
        $('presupuesto-form-mensaje').textContent = error.message;
      }
    } finally {
      boton.disabled = false;
      boton.textContent = 'Guardar';
    }
  }

  function abrirFormularioItemPresupuesto(item) {
    const actual = estado.presupuestoActual;
    if (!actual || !actual.presupuesto || !puedeEscribir()) return;
    if (['PENDIENTE', 'ENVIADO'].indexOf(actual.presupuesto.estado) === -1) {
      window.alert('El presupuesto ya está cerrado y no se puede modificar.');
      return;
    }

    const edicion = !!item;
    estado.itemPresupuestoEditando = edicion ? item : null;
    $('item-presupuesto-titulo').textContent = edicion ? 'Editar ítem' : 'Agregar ítem';
    $('item-presupuesto-contexto').textContent = actual.presupuesto.presupuesto_id +
      ' · ' + (actual.presupuesto.cliente_nombre || '');
    $('item-presupuesto-tipo').value = edicion ? item.tipo : 'MATERIAL';
    $('item-presupuesto-descripcion').value = edicion ? item.descripcion : '';
    $('item-presupuesto-cantidad').value = edicion ? item.cantidad : '1';
    $('item-presupuesto-unidad').value = edicion ? item.unidad : 'UN';
    $('item-presupuesto-precio').value = edicion ? item.precio_unitario : '0';
    $('item-presupuesto-mensaje').textContent = '';
    actualizarSubtotalItemPresupuesto();
    mostrarDialogo_('dialogo-item-presupuesto');
    setTimeout(function () { $('item-presupuesto-descripcion').focus(); }, 50);
  }

  function cerrarFormularioItemPresupuesto() {
    estado.itemPresupuestoEditando = null;
    $('item-presupuesto-mensaje').textContent = '';
    ocultarDialogo_('dialogo-item-presupuesto');
  }

  function actualizarSubtotalItemPresupuesto() {
    const cantidad = Number($('item-presupuesto-cantidad').value) || 0;
    const precio = Number($('item-presupuesto-precio').value) || 0;
    $('item-presupuesto-subtotal').textContent =
      'Subtotal: ' + monedaPresupuesto_(cantidad * precio);
  }

  async function guardarItemPresupuesto(evento) {
    evento.preventDefault();
    const actual = estado.presupuestoActual;
    if (!actual || !actual.presupuesto) return;

    const item = {
      tipo: $('item-presupuesto-tipo').value,
      descripcion: $('item-presupuesto-descripcion').value.trim(),
      cantidad: Number($('item-presupuesto-cantidad').value),
      unidad: $('item-presupuesto-unidad').value,
      precio_unitario: Number($('item-presupuesto-precio').value)
    };

    if (!item.descripcion) {
      $('item-presupuesto-mensaje').textContent = 'Escribí la descripción del ítem.';
      return;
    }
    if (!(item.cantidad > 0)) {
      $('item-presupuesto-mensaje').textContent = 'La cantidad debe ser mayor a cero.';
      return;
    }
    if (!(item.precio_unitario >= 0)) {
      $('item-presupuesto-mensaje').textContent = 'El precio no es válido.';
      return;
    }

    const editando = estado.itemPresupuestoEditando;
    const boton = $('btn-item-presupuesto-guardar');
    $('item-presupuesto-mensaje').textContent = '';
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      const cuerpo = editando
        ? { item_id: editando.item_id, item: item }
        : { presupuesto_id: actual.presupuesto.presupuesto_id, item: item };
      const resultado = await api(
        editando ? 'presupuesto.item.actualizar' : 'presupuesto.item.agregar',
        cuerpo
      );
      cerrarFormularioItemPresupuesto();
      renderizarDetallePresupuesto(resultado);
      await cargarPresupuestos();
      $('presupuestos-mensaje').textContent = editando
        ? 'Ítem actualizado.'
        : 'Ítem agregado.';
      $('presupuestos-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        cerrarFormularioItemPresupuesto();
        manejarError(error);
      } else {
        $('item-presupuesto-mensaje').textContent = error.message;
      }
    } finally {
      boton.disabled = false;
      boton.textContent = 'Guardar ítem';
    }
  }

  async function anularItemPresupuesto(item) {
    if (!item || !puedeEscribir()) return;
    const seguro = window.confirm('¿Anular el ítem «' + item.descripcion + '»?\n\n' +
      'No se borra: queda marcado como ANULADO y deja de sumar al total.');
    if (!seguro) return;

    try {
      const resultado = await api('presupuesto.item.anular', {
        item_id: item.item_id,
        motivo: 'Anulado desde la pantalla'
      });
      renderizarDetallePresupuesto(resultado);
      await cargarPresupuestos();
      $('presupuestos-mensaje').textContent = 'Ítem anulado.';
      $('presupuestos-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
      } else {
        window.alert(error.message);
      }
    }
  }

  async function cambiarEstadoPresupuesto(nuevoEstado) {
    const actual = estado.presupuestoActual;
    if (!actual || !actual.presupuesto) return;
    const id = actual.presupuesto.presupuesto_id;

    const mensajes = {
      ENVIADO: '¿Marcar el presupuesto ' + id + ' como enviado?',
      ACEPTADO: '¿Aceptar el presupuesto ' + id + '?\n\nSe va a crear un trabajo planificado.',
      RECHAZADO: '¿Rechazar el presupuesto ' + id + '?',
      VENCIDO: '¿Marcar el presupuesto ' + id + ' como vencido?',
      ANULADO: '¿Anular el presupuesto ' + id + '?\n\nNo se borra: queda marcado como ANULADO.'
    };
    if (!window.confirm(mensajes[nuevoEstado] || '¿Cambiar el estado del presupuesto?')) return;

    try {
      const resultado = await api('presupuesto.estado', {
        presupuesto_id: id,
        estado: nuevoEstado,
        motivo: 'Cambio desde la pantalla'
      });
      renderizarDetallePresupuesto(resultado);
      await cargarPresupuestos();
      $('presupuestos-mensaje').textContent = 'Estado actualizado: ' +
        estadoPresupuestoLegible_(nuevoEstado) + '.';
      $('presupuestos-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
      } else {
        window.alert(error.message);
      }
    }
  }

  function cerrarDetallePresupuesto() {
    estado.presupuestoActual = null;
    const contenedor = $('presupuesto-detalle');
    contenedor.innerHTML = '';
    contenedor.classList.add('oculto');
  }

  function buscarPresupuestos(evento) {
    evento.preventDefault();
    cerrarDetallePresupuesto();
    cargarPresupuestos();
  }

  // -------------------------------------------------------------------------
  // Trabajos realizados
  // -------------------------------------------------------------------------

  function abrirTrabajos(filtro) {
    if (filtro !== undefined) {
      const nuevo = String(filtro || 'TODOS').toUpperCase();
      estado.trabajosEstado = nuevo || 'TODOS';
    }
    estado.trabajosItems = [];
    estado.trabajoActual = null;
    $('buscar-trabajo').value = '';
    cerrarDetalleTrabajo();
    actualizarFiltrosTrabajos();
    irA('trabajos');
    cargarTrabajos();
  }

  function actualizarFiltrosTrabajos() {
    document.querySelectorAll('#pantalla-trabajos .presupuestos-filtros .btn-filtro')
      .forEach(function (boton) {
        boton.classList.toggle('activo',
          boton.getAttribute('data-estado') === estado.trabajosEstado);
      });
    const titulos = {
      TODOS: 'Todos los trabajos',
      PLANIFICADO: 'Trabajos planificados',
      EN_CURSO: 'Trabajos en curso',
      FINALIZADO: 'Trabajos finalizados',
      COBRADO: 'Trabajos cobrados',
      ANULADO: 'Trabajos anulados'
    };
    $('trabajos-titulo').textContent =
      titulos[estado.trabajosEstado] || titulos.TODOS;
  }

  async function cargarTrabajos() {
    const solicitud = (estado.trabajosSolicitud || 0) + 1;
    estado.trabajosSolicitud = solicitud;
    estado.trabajosCargando = true;

    const datos = { texto: $('buscar-trabajo').value.trim() };
    if (estado.trabajosEstado !== 'TODOS') {
      datos.estado = estado.trabajosEstado;
    }

    const teniaItems = (estado.trabajosItems || []).length > 0;
    $('trabajos-mensaje').textContent = teniaItems ? 'Actualizando…' : 'Cargando…';
    $('trabajos-mensaje').classList.remove('ok');
    if (!teniaItems) $('trabajos-lista').innerHTML = '';

    try {
      const resultado = await api('trabajo.buscar', datos);
      if (solicitud !== estado.trabajosSolicitud) return;
      estado.trabajosItems = (resultado && resultado.trabajos) || [];
      renderizarTrabajos(estado.trabajosItems);
    } catch (error) {
      if (solicitud !== estado.trabajosSolicitud) return;
      $('trabajos-mensaje').textContent = error.message;
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
      }
    } finally {
      if (solicitud === estado.trabajosSolicitud) {
        estado.trabajosCargando = false;
      }
    }
  }

  function renderizarTrabajos(items) {
    const lista = $('trabajos-lista');
    lista.innerHTML = '';

    if (!items.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacio';
      vacio.textContent = estado.trabajosEstado === 'TODOS'
        ? 'Todavía no hay trabajos. Se crean al aceptar un presupuesto.'
        : 'No encontré trabajos con ese filtro.';
      lista.appendChild(vacio);
      $('trabajos-mensaje').textContent = '';
      return;
    }

    $('trabajos-mensaje').textContent = items.length +
      (items.length === 1 ? ' trabajo.' : ' trabajos.');

    items.forEach(function (trabajo) {
      const tarjeta = document.createElement('button');
      tarjeta.type = 'button';
      tarjeta.className = 'presupuesto-item';

      const superior = document.createElement('div');
      superior.className = 'presupuesto-item-superior';

      const identificador = document.createElement('strong');
      identificador.textContent = trabajo.trabajo_id || 'Trabajo';

      const estadoNodo = document.createElement('span');
      estadoNodo.className = 'presupuesto-estado ' +
        estadoTrabajoClase_(trabajo.estado);
      estadoNodo.textContent = estadoTrabajoLegible_(trabajo.estado);

      superior.appendChild(identificador);
      superior.appendChild(estadoNodo);

      const cliente = document.createElement('span');
      cliente.className = 'presupuesto-cliente';
      cliente.textContent = trabajo.cliente_nombre || trabajo.cliente_id || 'Sin cliente';

      const descripcion = document.createElement('span');
      descripcion.className = 'presupuesto-descripcion';
      descripcion.textContent = trabajo.descripcion || 'Sin descripción';

      const meta = document.createElement('span');
      meta.className = 'presupuesto-meta';
      const partes = [
        tipoInstalacionLegible_(trabajo.tipo_instalacion) || 'Sin tipo',
        trabajo.fecha_inicio ? 'Inicio ' + fechaCorta(trabajo.fecha_inicio) : 'Sin inicio'
      ];
      if (trabajo.presupuesto_id) partes.push(trabajo.presupuesto_id);
      if (Number(trabajo.importe_adicional) > 0) {
        partes.push('Adicional ' + monedaPresupuesto_(trabajo.importe_adicional));
      }
      if (Number(trabajo.costo_total) > 0) {
        partes.push('Costos ' + monedaPresupuesto_(trabajo.costo_total));
      }
      meta.textContent = partes.join(' · ');

      const total = document.createElement('span');
      total.className = 'presupuesto-total';
      total.textContent = monedaPresupuesto_(trabajo.importe_presupuestado);

      tarjeta.appendChild(superior);
      tarjeta.appendChild(cliente);
      tarjeta.appendChild(descripcion);
      tarjeta.appendChild(meta);
      tarjeta.appendChild(total);
      tarjeta.addEventListener('click', function () {
        abrirDetalleTrabajo(trabajo.trabajo_id);
      });
      lista.appendChild(tarjeta);
    });
  }

  function coincideFiltroTrabajo_(trabajo) {
    if (!trabajo) return false;
    const filtro = String(estado.trabajosEstado || 'TODOS').toUpperCase();
    if (filtro !== 'TODOS' &&
        String(trabajo.estado || '').toUpperCase() !== filtro) {
      return false;
    }
    const texto = normalizar($('buscar-trabajo').value);
    if (!texto) return true;
    return normalizar([
      trabajo.trabajo_id,
      trabajo.presupuesto_id,
      trabajo.direccion,
      trabajo.descripcion,
      trabajo.tipo_instalacion,
      trabajo.cliente_nombre
    ].join(' ')).indexOf(texto) !== -1;
  }

  function actualizarTrabajoEnLista_(trabajo) {
    if (!trabajo) return;
    const items = estado.trabajosItems || [];
    const indice = items.findIndex(function (item) {
      return item.trabajo_id === trabajo.trabajo_id;
    });
    if (!coincideFiltroTrabajo_(trabajo)) {
      if (indice !== -1) items.splice(indice, 1);
    } else if (indice === -1) {
      items.unshift(trabajo);
    } else {
      items[indice] = Object.assign({}, items[indice], trabajo);
    }
    estado.trabajosItems = items;
    renderizarTrabajos(items);
  }

  async function abrirDetalleTrabajo(id) {
    if (!id) return;

    const solicitud = (estado.trabajoDetalleSolicitud || 0) + 1;
    estado.trabajoDetalleSolicitud = solicitud;
    estado.trabajoActual = null;
    const contenedor = $('trabajo-detalle');
    contenedor.classList.remove('oculto');
    contenedor.innerHTML = '<p class="ayuda">Cargando trabajo…</p>';
    contenedor.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const datos = await api('trabajo.obtener', { trabajo_id: id });
      if (solicitud !== estado.trabajoDetalleSolicitud) return;
      renderizarDetalleTrabajo(datos);
    } catch (error) {
      if (solicitud !== estado.trabajoDetalleSolicitud) return;
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
        return;
      }
      contenedor.innerHTML = '';
      const mensaje = document.createElement('p');
      mensaje.className = 'mensaje-error';
      mensaje.textContent = error.message;
      contenedor.appendChild(mensaje);
    }
  }

  function renderizarDetalleTrabajo(datos) {
    if (!datos || !datos.trabajo) return;
    const trabajo = datos.trabajo;
    const costos = datos.costos || [];
    const adicionales = datos.adicionales || [];
    const resumen = datos.resumen || trabajo;
    const editable = puedeEditarTrabajo_(trabajo);
    const costosEditables = puedeCostosTrabajo_(trabajo);
    const adicionalesEditables = puedeAdicionalesTrabajo_(trabajo);
    estado.trabajoActual = datos;

    const contenedor = $('trabajo-detalle');
    contenedor.innerHTML = '';

    const cabecera = document.createElement('div');
    cabecera.className = 'detalle-cabecera';

    const titulos = document.createElement('div');
    const titulo = document.createElement('h2');
    titulo.textContent = trabajo.cliente_nombre || trabajo.cliente_id;
    const identificador = document.createElement('p');
    identificador.className = 'detalle-id';
    identificador.textContent = trabajo.trabajo_id + ' · ' +
      estadoTrabajoLegible_(trabajo.estado);
    titulos.appendChild(titulo);
    titulos.appendChild(identificador);

    const cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'btn-texto';
    cerrar.textContent = 'Cerrar';
    cerrar.addEventListener('click', cerrarDetalleTrabajo);

    cabecera.appendChild(titulos);
    cabecera.appendChild(cerrar);
    contenedor.appendChild(cabecera);

    const total = document.createElement('p');
    total.className = 'presupuesto-total-detalle';
    let totalTexto = 'Presupuestado total ' +
      monedaPresupuesto_(trabajo.importe_presupuestado);
    if (Number(trabajo.importe_adicional) > 0) {
      totalTexto += ' · Base ' +
        monedaPresupuesto_(trabajo.importe_presupuestado_base) +
        ' + adicionales ' + monedaPresupuesto_(trabajo.importe_adicional);
    }
    total.textContent = totalTexto;
    contenedor.appendChild(total);

    const campos = document.createElement('div');
    campos.className = 'detalle-campos';
    agregarCampoDirectorio_(campos, 'Cliente', trabajo.cliente_nombre);
    agregarCampoDirectorio_(campos, 'Teléfono', trabajo.cliente_telefono);
    agregarCampoDirectorio_(campos, 'Dirección', trabajo.direccion);
    agregarCampoDirectorio_(campos, 'Instalación', tipoInstalacionLegible_(trabajo.tipo_instalacion));
    agregarCampoDirectorio_(campos, 'Descripción', trabajo.descripcion);
    agregarCampoDirectorio_(campos, 'Inicio', fechaCorta(trabajo.fecha_inicio));
    agregarCampoDirectorio_(campos, 'Fin', fechaCorta(trabajo.fecha_fin));
    agregarCampoDirectorio_(campos, 'Presupuesto', trabajo.presupuesto_id);
    if (datos.presupuesto) {
      agregarCampoDirectorio_(campos, 'Estado presupuesto',
        estadoPresupuestoLegible_(datos.presupuesto.estado));
    }
    agregarCampoDirectorio_(campos, 'Observaciones', trabajo.observaciones);
    contenedor.appendChild(campos);

    const economia = document.createElement('div');
    economia.className = 'trabajo-resumen';
    agregarResumenTrabajo_(economia, 'Presupuestado',
      monedaPresupuesto_(resumen.importe_presupuestado));
    agregarResumenTrabajo_(economia, 'Adicionales',
      monedaPresupuesto_(resumen.importe_adicional));
    agregarResumenTrabajo_(economia, 'Cobrado', monedaPresupuesto_(resumen.importe_cobrado));
    agregarResumenTrabajo_(economia, 'Costos', monedaPresupuesto_(resumen.costo_total));
    agregarResumenTrabajo_(economia, 'Resultado', monedaPresupuesto_(resumen.resultado));
    agregarResumenTrabajo_(economia, 'Saldo a cobrar', monedaPresupuesto_(resumen.saldo_cobro));
    contenedor.appendChild(economia);

    const acciones = document.createElement('div');
    acciones.className = 'detalle-acciones presupuesto-acciones';

    if (editable) {
      agregarAccionPresupuesto_(acciones, 'Editar', 'btn-secundario', function () {
        abrirFormularioTrabajo(trabajo);
      });
    }
    if (adicionalesEditables) {
      agregarAccionPresupuesto_(acciones, 'Agregar adicional', 'btn-secundario', function () {
        abrirFormularioAdicionalTrabajo();
      });
    }
    if (costosEditables) {
      agregarAccionPresupuesto_(acciones, 'Agregar costo', 'btn-secundario', function () {
        abrirFormularioCostoTrabajo();
      });
    }
    if (puedeEscribir() && trabajo.estado === 'PLANIFICADO') {
      agregarAccionPresupuesto_(acciones, 'Iniciar', 'btn-principal', function () {
        cambiarEstadoTrabajo('EN_CURSO');
      });
    }
    if (puedeEscribir() && trabajo.estado === 'EN_CURSO') {
      agregarAccionPresupuesto_(acciones, 'Finalizar', 'btn-principal', function () {
        cambiarEstadoTrabajo('FINALIZADO');
      });
    }
    if (puedeEscribir() && trabajo.estado === 'FINALIZADO') {
      agregarAccionPresupuesto_(acciones, 'Marcar cobrado', 'btn-principal', function () {
        cambiarEstadoTrabajo('COBRADO');
      });
    }
    if (esPropietario() && ['PLANIFICADO', 'EN_CURSO', 'FINALIZADO'].indexOf(trabajo.estado) !== -1) {
      agregarAccionPresupuesto_(acciones, 'Anular', 'btn-peligro', function () {
        cambiarEstadoTrabajo('ANULADO');
      });
    }
    if (!puedeEscribir()) {
      const aviso = document.createElement('p');
      aviso.className = 'ayuda';
      aviso.textContent = 'Solo lectura: no podés modificar trabajos.';
      acciones.appendChild(aviso);
    }
    contenedor.appendChild(acciones);

    if (trabajo.estado === 'COBRADO') {
      const aviso = document.createElement('p');
      aviso.className = 'ayuda';
      aviso.textContent = 'Trabajo cerrado. Los cobros y movimientos se gestionan en control económico.';
      contenedor.appendChild(aviso);
    }

    const adicionalesTitulo = document.createElement('h3');
    adicionalesTitulo.textContent = 'Adicionales al cliente';
    contenedor.appendChild(adicionalesTitulo);

    if (!adicionales.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacio';
      vacio.textContent = 'El trabajo todavía no tiene adicionales.';
      contenedor.appendChild(vacio);
    } else {
      const listaAdicionales = document.createElement('div');
      listaAdicionales.className = 'presupuesto-items';
      adicionales.forEach(function (adicional) {
        listaAdicionales.appendChild(
          crearLineaAdicionalTrabajo_(adicional, adicionalesEditables)
        );
      });
      contenedor.appendChild(listaAdicionales);
    }

    const costosTitulo = document.createElement('h3');
    costosTitulo.textContent = 'Costos reales';
    contenedor.appendChild(costosTitulo);

    if (!costos.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacio';
      vacio.textContent = 'El trabajo todavía no tiene costos cargados.';
      contenedor.appendChild(vacio);
    } else {
      const listaCostos = document.createElement('div');
      listaCostos.className = 'presupuesto-items';
      costos.forEach(function (costo) {
        listaCostos.appendChild(crearLineaCostoTrabajo_(costo, costosEditables));
      });
      contenedor.appendChild(listaCostos);
    }

    const historialTitulo = document.createElement('h3');
    historialTitulo.textContent = 'Historial de cambios';
    contenedor.appendChild(historialTitulo);

    const historial = datos.historial || [];
    if (!historial.length) {
      const vacio = document.createElement('p');
      vacio.className = 'agenda-vacio';
      vacio.textContent = 'Todavía no hay cambios registrados.';
      contenedor.appendChild(vacio);
      return;
    }

    const listaHistorial = document.createElement('div');
    listaHistorial.className = 'historial-lista';
    historial.slice(0, 30).forEach(function (log) {
      const item = document.createElement('div');
      item.className = 'historial-item';

      const linea = document.createElement('div');
      linea.className = 'historial-linea';
      const accion = document.createElement('strong');
      accion.textContent = accionTrabajoLegible_(log.accion);
      const fecha = document.createElement('span');
      fecha.textContent = fechaHoraCorta(log.fecha);
      linea.appendChild(accion);
      linea.appendChild(fecha);

      const detalle = document.createElement('p');
      detalle.textContent = resumenDetalleLogTrabajo_(log.detalle);

      const meta = document.createElement('span');
      meta.className = 'historial-meta';
      meta.textContent = (log.usuario || '') + (log.origen ? ' · ' + log.origen : '');

      item.appendChild(linea);
      if (detalle.textContent) item.appendChild(detalle);
      item.appendChild(meta);
      listaHistorial.appendChild(item);
    });
    contenedor.appendChild(listaHistorial);
  }

  function agregarResumenTrabajo_(contenedor, etiqueta, valor) {
    const bloque = document.createElement('div');
    bloque.className = 'trabajo-resumen-item';
    const nombre = document.createElement('span');
    nombre.textContent = etiqueta;
    const dato = document.createElement('strong');
    dato.textContent = valor;
    bloque.appendChild(nombre);
    bloque.appendChild(dato);
    contenedor.appendChild(bloque);
  }

  function crearLineaCostoTrabajo_(costo, puedeEditar) {
    const linea = document.createElement('div');
    linea.className = 'presupuesto-item-linea' +
      (costo.estado === 'ANULADO' ? ' anulado' : '');

    const cuerpo = document.createElement('div');
    cuerpo.className = 'presupuesto-item-cuerpo';

    const descripcion = document.createElement('strong');
    descripcion.textContent = costo.descripcion;

    const meta = document.createElement('span');
    meta.className = 'presupuesto-item-meta';
    const partes = [
      tipoCostoTrabajoLegible_(costo.tipo),
      'Cantidad ' + costo.cantidad,
      fechaCorta(costo.fecha)
    ];
    if (costo.proveedor_nombre) partes.push(costo.proveedor_nombre);
    if (costo.estado === 'ANULADO') partes.push('ANULADO');
    meta.textContent = partes.join(' · ');

    cuerpo.appendChild(descripcion);
    cuerpo.appendChild(meta);

    const importe = document.createElement('span');
    importe.className = 'presupuesto-item-subtotal';
    importe.textContent = monedaPresupuesto_(costo.importe);

    const acciones = document.createElement('div');
    acciones.className = 'presupuesto-item-acciones';
    if (puedeEditar && puedeEscribir() && costo.estado !== 'ANULADO') {
      const editar = document.createElement('button');
      editar.type = 'button';
      editar.className = 'btn-reprogramar';
      editar.textContent = 'Editar';
      editar.addEventListener('click', function () {
        abrirFormularioCostoTrabajo(costo);
      });

      const anular = document.createElement('button');
      anular.type = 'button';
      anular.className = 'btn-anular';
      anular.textContent = 'Anular';
      anular.addEventListener('click', function () {
        anularCostoTrabajo(costo);
      });

      acciones.appendChild(editar);
      acciones.appendChild(anular);
    }

    linea.appendChild(cuerpo);
    linea.appendChild(importe);
    if (acciones.childNodes.length) linea.appendChild(acciones);
    return linea;
  }

  function crearLineaAdicionalTrabajo_(adicional, puedeEditar) {
    const linea = document.createElement('div');
    linea.className = 'presupuesto-item-linea' +
      (adicional.estado === 'ANULADO' ? ' anulado' : '');

    const cuerpo = document.createElement('div');
    cuerpo.className = 'presupuesto-item-cuerpo';

    const descripcion = document.createElement('strong');
    descripcion.textContent = adicional.descripcion;

    const meta = document.createElement('span');
    meta.className = 'presupuesto-item-meta';
    const partes = [fechaCorta(adicional.fecha)];
    if (adicional.estado === 'ANULADO') partes.push('ANULADO');
    meta.textContent = partes.join(' · ');

    cuerpo.appendChild(descripcion);
    cuerpo.appendChild(meta);

    const importe = document.createElement('span');
    importe.className = 'presupuesto-item-subtotal';
    importe.textContent = monedaPresupuesto_(adicional.importe);

    const acciones = document.createElement('div');
    acciones.className = 'presupuesto-item-acciones';
    if (puedeEditar && puedeEscribir() && adicional.estado !== 'ANULADO') {
      const editar = document.createElement('button');
      editar.type = 'button';
      editar.className = 'btn-reprogramar';
      editar.textContent = 'Editar';
      editar.addEventListener('click', function () {
        abrirFormularioAdicionalTrabajo(adicional);
      });

      const anular = document.createElement('button');
      anular.type = 'button';
      anular.className = 'btn-anular';
      anular.textContent = 'Anular';
      anular.addEventListener('click', function () {
        anularAdicionalTrabajo(adicional);
      });

      acciones.appendChild(editar);
      acciones.appendChild(anular);
    }

    linea.appendChild(cuerpo);
    linea.appendChild(importe);
    if (acciones.childNodes.length) linea.appendChild(acciones);
    return linea;
  }

  function abrirFormularioTrabajo(trabajo) {
    if (!trabajo || !puedeEditarTrabajo_(trabajo)) return;
    estado.trabajoActual = estado.trabajoActual || { trabajo: trabajo };
    $('trabajo-form-titulo').textContent = 'Editar trabajo';
    $('trabajo-form-contexto').textContent = trabajo.trabajo_id + ' · ' +
      (trabajo.cliente_nombre || '');
    $('trabajo-direccion').value = trabajo.direccion || '';
    $('trabajo-fecha-inicio').value = trabajo.fecha_inicio || '';
    $('trabajo-fecha-fin').value = trabajo.fecha_fin || '';
    $('trabajo-tipo').value = trabajo.tipo_instalacion || '';
    $('trabajo-descripcion').value = trabajo.descripcion || '';
    $('trabajo-observaciones').value = trabajo.observaciones || '';
    $('trabajo-form-mensaje').textContent = '';
    mostrarDialogo_('dialogo-trabajo');
    setTimeout(function () { $('trabajo-direccion').focus(); }, 50);
  }

  function cerrarFormularioTrabajo() {
    $('trabajo-form-mensaje').textContent = '';
    ocultarDialogo_('dialogo-trabajo');
  }

  async function guardarTrabajo(evento) {
    evento.preventDefault();
    const actual = estado.trabajoActual;
    if (!actual || !actual.trabajo) return;

    const entrada = {
      trabajo_id: actual.trabajo.trabajo_id,
      direccion: $('trabajo-direccion').value.trim(),
      fecha_inicio: $('trabajo-fecha-inicio').value,
      fecha_fin: $('trabajo-fecha-fin').value,
      tipo_instalacion: $('trabajo-tipo').value,
      descripcion: $('trabajo-descripcion').value.trim(),
      observaciones: $('trabajo-observaciones').value.trim()
    };

    if (!entrada.direccion) {
      $('trabajo-form-mensaje').textContent = 'Escribí la dirección del trabajo.';
      return;
    }
    if (entrada.fecha_inicio && entrada.fecha_fin &&
        entrada.fecha_fin < entrada.fecha_inicio) {
      $('trabajo-form-mensaje').textContent =
        'La fecha de fin no puede ser anterior a la de inicio.';
      return;
    }

    const boton = $('btn-trabajo-guardar');
    $('trabajo-form-mensaje').textContent = '';
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      const resultado = await api('trabajo.actualizar', entrada);
      cerrarFormularioTrabajo();
      renderizarDetalleTrabajo(resultado);
      actualizarTrabajoEnLista_(resultado.trabajo);
      $('trabajos-mensaje').textContent = 'Trabajo actualizado.';
      $('trabajos-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        cerrarFormularioTrabajo();
        manejarError(error);
      } else {
        $('trabajo-form-mensaje').textContent = error.message;
      }
    } finally {
      boton.disabled = false;
      boton.textContent = 'Guardar';
    }
  }

  async function abrirFormularioCostoTrabajo(costo) {
    const actual = estado.trabajoActual;
    if (!actual || !actual.trabajo || !puedeCostosTrabajo_(actual.trabajo)) return;

    const edicion = !!costo;
    estado.costoTrabajoEditando = edicion ? costo : null;
    $('costo-trabajo-titulo').textContent = edicion ? 'Editar costo' : 'Agregar costo';
    $('costo-trabajo-contexto').textContent = actual.trabajo.trabajo_id +
      ' · ' + (actual.trabajo.cliente_nombre || '');
    $('costo-trabajo-tipo').value = edicion ? costo.tipo : 'MATERIAL';
    $('costo-trabajo-descripcion').value = edicion ? costo.descripcion : '';
    $('costo-trabajo-cantidad').value = edicion ? costo.cantidad : '1';
    $('costo-trabajo-importe').value = edicion ? costo.importe : '';
    $('costo-trabajo-fecha').value = edicion ? (costo.fecha || fechaISO(new Date())) : fechaISO(new Date());
    $('costo-trabajo-mensaje').textContent = '';

    const select = $('costo-trabajo-proveedor');
    select.innerHTML = '<option value="">Cargando proveedores…</option>';
    mostrarDialogo_('dialogo-costo-trabajo');

    if (!estado.proveedoresFormularioCargados) {
      try {
        const proveedores = await api('proveedor.buscar', { texto: '' });
        estado.proveedoresFormulario = proveedores || [];
        estado.proveedoresFormularioCargados = true;
      } catch (error) {
        estado.proveedoresFormulario = [];
        if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
          cerrarFormularioCostoTrabajo();
          manejarError(error);
          return;
        }
        $('costo-trabajo-mensaje').textContent = error.message;
      }
    }

    const lista = (estado.proveedoresFormulario || []).slice();
    if (edicion && costo.proveedor_id &&
        !lista.some(function (p) { return p.proveedor_id === costo.proveedor_id; })) {
      lista.unshift({
        proveedor_id: costo.proveedor_id,
        nombre_comercial: costo.proveedor_nombre || costo.proveedor_id
      });
    }

    select.innerHTML = '';
    const sinProveedor = document.createElement('option');
    sinProveedor.value = '';
    sinProveedor.textContent = 'Sin proveedor';
    select.appendChild(sinProveedor);
    lista.forEach(function (proveedor) {
      const opcion = document.createElement('option');
      opcion.value = proveedor.proveedor_id;
      opcion.textContent = proveedor.nombre_comercial || proveedor.proveedor_id;
      select.appendChild(opcion);
    });
    select.value = edicion ? (costo.proveedor_id || '') : '';
    setTimeout(function () { $('costo-trabajo-descripcion').focus(); }, 50);
  }

  function cerrarFormularioCostoTrabajo() {
    estado.costoTrabajoEditando = null;
    $('costo-trabajo-mensaje').textContent = '';
    ocultarDialogo_('dialogo-costo-trabajo');
  }

  async function guardarCostoTrabajo(evento) {
    evento.preventDefault();
    const actual = estado.trabajoActual;
    if (!actual || !actual.trabajo) return;

    const costo = {
      tipo: $('costo-trabajo-tipo').value,
      descripcion: $('costo-trabajo-descripcion').value.trim(),
      cantidad: Number($('costo-trabajo-cantidad').value),
      importe: Number($('costo-trabajo-importe').value),
      proveedor_id: $('costo-trabajo-proveedor').value,
      fecha: $('costo-trabajo-fecha').value
    };

    if (!costo.descripcion) {
      $('costo-trabajo-mensaje').textContent = 'Escribí la descripción del costo.';
      return;
    }
    if (!(costo.cantidad > 0)) {
      $('costo-trabajo-mensaje').textContent = 'La cantidad debe ser mayor a cero.';
      return;
    }
    if (!(costo.importe > 0)) {
      $('costo-trabajo-mensaje').textContent = 'El importe debe ser mayor a cero.';
      return;
    }
    if (!costo.fecha) {
      $('costo-trabajo-mensaje').textContent = 'Elegí la fecha del costo.';
      return;
    }

    const editando = estado.costoTrabajoEditando;
    const boton = $('btn-costo-trabajo-guardar');
    $('costo-trabajo-mensaje').textContent = '';
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      const cuerpo = editando
        ? { costo_id: editando.costo_id, costo: costo }
        : { trabajo_id: actual.trabajo.trabajo_id, costo: costo };
      const resultado = await api(
        editando ? 'trabajo.costo.actualizar' : 'trabajo.costo.agregar',
        cuerpo
      );
      cerrarFormularioCostoTrabajo();
      renderizarDetalleTrabajo(resultado);
      actualizarTrabajoEnLista_(resultado.trabajo);
      $('trabajos-mensaje').textContent = editando
        ? 'Costo actualizado.'
        : 'Costo agregado.';
      $('trabajos-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        cerrarFormularioCostoTrabajo();
        manejarError(error);
      } else {
        $('costo-trabajo-mensaje').textContent = error.message;
      }
    } finally {
      boton.disabled = false;
      boton.textContent = 'Guardar costo';
    }
  }

  function abrirFormularioAdicionalTrabajo(adicional) {
    const actual = estado.trabajoActual;
    if (!actual || !actual.trabajo || !puedeAdicionalesTrabajo_(actual.trabajo)) return;

    const edicion = !!adicional;
    estado.adicionalTrabajoEditando = edicion ? adicional : null;
    $('adicional-trabajo-titulo').textContent = edicion
      ? 'Editar adicional'
      : 'Agregar adicional';
    $('adicional-trabajo-contexto').textContent = actual.trabajo.trabajo_id +
      ' · ' + (actual.trabajo.cliente_nombre || '');
    $('adicional-trabajo-descripcion').value = edicion ? adicional.descripcion : '';
    $('adicional-trabajo-importe').value = edicion ? adicional.importe : '';
    $('adicional-trabajo-fecha').value = edicion
      ? (adicional.fecha || fechaISO(new Date()))
      : fechaISO(new Date());
    $('adicional-trabajo-mensaje').textContent = '';
    mostrarDialogo_('dialogo-adicional-trabajo');
    setTimeout(function () { $('adicional-trabajo-descripcion').focus(); }, 50);
  }

  function cerrarFormularioAdicionalTrabajo() {
    estado.adicionalTrabajoEditando = null;
    $('adicional-trabajo-mensaje').textContent = '';
    ocultarDialogo_('dialogo-adicional-trabajo');
  }

  async function guardarAdicionalTrabajo(evento) {
    evento.preventDefault();
    const actual = estado.trabajoActual;
    if (!actual || !actual.trabajo) return;

    const adicional = {
      descripcion: $('adicional-trabajo-descripcion').value.trim(),
      importe: Number($('adicional-trabajo-importe').value),
      fecha: $('adicional-trabajo-fecha').value
    };

    if (!adicional.descripcion) {
      $('adicional-trabajo-mensaje').textContent =
        'Escribí la descripción del adicional.';
      return;
    }
    if (!(adicional.importe > 0)) {
      $('adicional-trabajo-mensaje').textContent =
        'El importe debe ser mayor a cero.';
      return;
    }
    if (!adicional.fecha) {
      $('adicional-trabajo-mensaje').textContent =
        'Elegí la fecha del adicional.';
      return;
    }

    const editando = estado.adicionalTrabajoEditando;
    const boton = $('btn-adicional-trabajo-guardar');
    $('adicional-trabajo-mensaje').textContent = '';
    boton.disabled = true;
    boton.textContent = 'Guardando…';

    try {
      const cuerpo = editando
        ? { adicional_id: editando.adicional_id, adicional: adicional }
        : { trabajo_id: actual.trabajo.trabajo_id, adicional: adicional };
      const resultado = await api(
        editando ? 'trabajo.adicional.actualizar' : 'trabajo.adicional.agregar',
        cuerpo
      );
      cerrarFormularioAdicionalTrabajo();
      renderizarDetalleTrabajo(resultado);
      actualizarTrabajoEnLista_(resultado.trabajo);
      $('trabajos-mensaje').textContent = editando
        ? 'Adicional actualizado.'
        : 'Adicional agregado.';
      $('trabajos-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        cerrarFormularioAdicionalTrabajo();
        manejarError(error);
      } else {
        $('adicional-trabajo-mensaje').textContent = error.message;
      }
    } finally {
      boton.disabled = false;
      boton.textContent = 'Guardar adicional';
    }
  }

  async function anularAdicionalTrabajo(adicional) {
    if (!adicional || !puedeEscribir()) return;
    const seguro = window.confirm('¿Anular el adicional «' +
      adicional.descripcion + '»?\n\n' +
      'No se borra: queda marcado como ANULADO y deja de sumar al total.');
    if (!seguro) return;

    try {
      const resultado = await api('trabajo.adicional.anular', {
        adicional_id: adicional.adicional_id,
        motivo: 'Anulado desde la pantalla'
      });
      renderizarDetalleTrabajo(resultado);
      actualizarTrabajoEnLista_(resultado.trabajo);
      $('trabajos-mensaje').textContent = 'Adicional anulado.';
      $('trabajos-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
      } else {
        window.alert(error.message);
      }
    }
  }

  async function anularCostoTrabajo(costo) {
    if (!costo || !puedeEscribir()) return;
    const seguro = window.confirm('¿Anular el costo «' + costo.descripcion + '»?\n\n' +
      'No se borra: queda marcado como ANULADO y deja de sumar al total.');
    if (!seguro) return;

    try {
      const resultado = await api('trabajo.costo.anular', {
        costo_id: costo.costo_id,
        motivo: 'Anulado desde la pantalla'
      });
      renderizarDetalleTrabajo(resultado);
      actualizarTrabajoEnLista_(resultado.trabajo);
      $('trabajos-mensaje').textContent = 'Costo anulado.';
      $('trabajos-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
      } else {
        window.alert(error.message);
      }
    }
  }

  async function cambiarEstadoTrabajo(nuevoEstado) {
    const actual = estado.trabajoActual;
    if (!actual || !actual.trabajo) return;
    const id = actual.trabajo.trabajo_id;

    const mensajes = {
      EN_CURSO: '¿Iniciar el trabajo ' + id + '?',
      FINALIZADO: '¿Marcar el trabajo ' + id + ' como finalizado?',
      COBRADO: '¿Marcar el trabajo ' + id + ' como cobrado?\n\n' +
        'Los cobros y movimientos se registran en control económico.',
      ANULADO: '¿Anular el trabajo ' + id + '?\n\nNo se borra: queda marcado como ANULADO.'
    };
    if (!window.confirm(mensajes[nuevoEstado] || '¿Cambiar el estado del trabajo?')) return;

    try {
      const resultado = await api('trabajo.estado', {
        trabajo_id: id,
        estado: nuevoEstado,
        motivo: 'Cambio desde la pantalla'
      });
      renderizarDetalleTrabajo(resultado);
      actualizarTrabajoEnLista_(resultado.trabajo);
      $('trabajos-mensaje').textContent = 'Estado actualizado: ' +
        estadoTrabajoLegible_(nuevoEstado) + '.';
      $('trabajos-mensaje').classList.add('ok');
    } catch (error) {
      if (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA') {
        manejarError(error);
      } else {
        window.alert(error.message);
      }
    }
  }

  function cerrarDetalleTrabajo() {
    estado.trabajoActual = null;
    const contenedor = $('trabajo-detalle');
    contenedor.innerHTML = '';
    contenedor.classList.add('oculto');
  }

  function buscarTrabajos(evento) {
    evento.preventDefault();
    cerrarDetalleTrabajo();
    cargarTrabajos();
  }

  function puedeEditarTrabajo_(trabajo) {
    return puedeEscribir() && trabajo &&
      ['ANULADO', 'COBRADO'].indexOf(String(trabajo.estado || '').toUpperCase()) === -1;
  }

  function puedeCostosTrabajo_(trabajo) {
    return puedeEscribir() && trabajo &&
      ['ANULADO', 'COBRADO'].indexOf(String(trabajo.estado || '').toUpperCase()) === -1;
  }

  function puedeAdicionalesTrabajo_(trabajo) {
    return puedeCostosTrabajo_(trabajo);
  }

  function estadoTrabajoLegible_(estado) {
    const nombres = {
      PLANIFICADO: 'Planificado',
      EN_CURSO: 'En curso',
      FINALIZADO: 'Finalizado',
      COBRADO: 'Cobrado',
      ANULADO: 'Anulado'
    };
    const clave = String(estado || '').toUpperCase();
    return nombres[clave] || clave || 'Sin estado';
  }

  function estadoTrabajoClase_(estado) {
    return 'presupuesto-estado-' + String(estado || '').toLowerCase();
  }

  function tipoCostoTrabajoLegible_(tipo) {
    const nombres = {
      MATERIAL: 'Material',
      MANO_DE_OBRA: 'Mano de obra',
      GASTO_EXTRA: 'Gasto extra'
    };
    return nombres[String(tipo || '').toUpperCase()] || String(tipo || '');
  }

  function accionTrabajoLegible_(accion) {
    const nombres = {
      ALTA: 'Alta',
      MODIFICACION: 'Modificación',
      ESTADO: 'Cambio de estado',
      COSTO_ALTA: 'Costo agregado',
      COSTO_MODIFICACION: 'Costo modificado',
      COSTO_ANULACION: 'Costo anulado'
    };
    const clave = String(accion || '').toUpperCase();
    return nombres[clave] || clave || 'Cambio';
  }

  function resumenDetalleLogTrabajo_(texto) {
    if (!texto) return '';
    try {
      const datos = JSON.parse(texto);
      const nombres = {
        anterior: 'Antes',
        nuevo: 'Después',
        motivo: 'Motivo',
        tipo: 'Tipo',
        descripcion: 'Descripción',
        cantidad: 'Cantidad',
        importe: 'Importe',
        fecha: 'Fecha',
        fecha_inicio: 'Inicio',
        fecha_fin: 'Fin',
        direccion: 'Dirección',
        costo_id: 'Costo',
        proveedor_id: 'Proveedor'
      };
      return Object.keys(datos).slice(0, 6).map(function (clave) {
        const valor = datos[clave];
        if (valor === undefined || valor === null || valor === '') return '';
        const etiqueta = nombres[clave] || clave.replace(/_/g, ' ');
        if (typeof valor === 'object') return etiqueta + ': ' + JSON.stringify(valor);
        return etiqueta + ': ' + String(valor);
      }).filter(function (parte) { return !!parte; }).join(' · ');
    } catch (error) {
      return String(texto).slice(0, 240);
    }
  }

  function nombreSaludo_() {
    const usuario = estado.usuario || {};
    const nombre = String(usuario.nombre || '').trim();
    const rol = String(usuario.rol || '').toUpperCase();
    if (rol === 'PROPIETARIO' && (!nombre || /^propietario$/i.test(nombre))) {
      return 'Guillermo';
    }
    return nombre;
  }

  function puedeEscribir() {
    const rol = String((estado.usuario && estado.usuario.rol) || '').toUpperCase();
    return rol === 'PROPIETARIO' || rol === 'COLABORADOR';
  }

  function estadoPresupuestoLegible_(estado) {
    const nombres = {
      PENDIENTE: 'Pendiente',
      ENVIADO: 'Enviado',
      ACEPTADO: 'Aceptado',
      RECHAZADO: 'Rechazado',
      VENCIDO: 'Vencido',
      ANULADO: 'Anulado'
    };
    const clave = String(estado || '').toUpperCase();
    return nombres[clave] || clave || 'Sin estado';
  }

  function estadoPresupuestoClase_(estado) {
    return 'presupuesto-estado-' + String(estado || '').toLowerCase();
  }

  function tipoInstalacionLegible_(tipo) {
    const nombres = {
      ELECTRICA: 'Eléctrica',
      SANITARIA: 'Sanitaria',
      MATERIALES: 'Materiales',
      SERVICIO: 'Servicio'
    };
    return nombres[String(tipo || '').toUpperCase()] || String(tipo || '');
  }

  function tipoItemPresupuestoLegible_(tipo) {
    const nombres = {
      MATERIAL: 'Material',
      MANO_DE_OBRA: 'Mano de obra',
      OTRO: 'Otro'
    };
    return nombres[String(tipo || '').toUpperCase()] || String(tipo || '');
  }

  function estadoActividadLegible_(estado) {
    const nombres = {
      PENDIENTE: 'Pendiente',
      REALIZADA: 'Realizada',
      CANCELADA: 'Cancelada',
      REPROGRAMADA: 'Reprogramada',
      PLANIFICADO: 'Planificado',
      EN_CURSO: 'En curso',
      TERMINADO: 'Terminado'
    };
    const clave = String(estado || '').toUpperCase();
    return nombres[clave] || clave;
  }

  function accionPresupuestoLegible_(accion) {
    const nombres = {
      ALTA: 'Alta',
      MODIFICACION: 'Modificación',
      ITEM_ALTA: 'Ítem agregado',
      ITEM_MODIFICACION: 'Ítem modificado',
      ITEM_ANULACION: 'Ítem anulado',
      CAMBIO_ESTADO: 'Cambio de estado'
    };
    const clave = String(accion || '').toUpperCase();
    return nombres[clave] || clave || 'Cambio';
  }

  function resumenDetalleLogPresupuesto_(texto) {
    if (!texto) return '';
    try {
      const datos = JSON.parse(texto);
      const nombres = {
        antes: 'Antes',
        despues: 'Después',
        motivo: 'Motivo',
        total: 'Total',
        tipo: 'Tipo',
        descripcion: 'Descripción',
        cantidad: 'Cantidad',
        unidad: 'Unidad',
        precio_unitario: 'Precio',
        subtotal: 'Subtotal',
        item_id: 'Ítem',
        trabajo_id: 'Trabajo',
        cliente_id: 'Cliente',
        fecha_seguimiento: 'Seguimiento'
      };
      return Object.keys(datos).slice(0, 6).map(function (clave) {
        const valor = datos[clave];
        if (valor === undefined || valor === null || valor === '') return '';
        const etiqueta = nombres[clave] || clave.replace(/_/g, ' ');
        if (typeof valor === 'object') return etiqueta + ': ' + JSON.stringify(valor);
        return etiqueta + ': ' + String(valor);
      }).filter(function (parte) { return !!parte; }).join(' · ');
    } catch (error) {
      return String(texto).slice(0, 240);
    }
  }

  function monedaPresupuesto_(valor) {
    const numero = Number(valor) || 0;
    try {
      return numero.toLocaleString('es-AR', {
        style: 'currency',
        currency: MONEDA_PRESUPUESTO,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } catch (error) {
      return '$' + numero.toFixed(2);
    }
  }

  function mostrarDialogo_(id) {
    const dialogo = $(id);
    if (dialogo.showModal) dialogo.showModal();
    else dialogo.setAttribute('open', 'open');
  }

  function ocultarDialogo_(id) {
    const dialogo = $(id);
    if (dialogo.close) dialogo.close();
    else dialogo.removeAttribute('open');
  }

  function fechaHoraCorta(valor) {
    const texto = String(valor || '').trim();
    if (!texto) return '';
    return fechaCorta(texto.slice(0, 10)) + (texto.length > 10 ? ' ' + texto.slice(11, 16) : '');
  }

  function resumenAgenda(items, etiqueta) {
    if (!items.length) return 'No tenés actividades para ' + etiqueta + '.';

    const partes = items.slice(0, 3).map(function (actividad) {
      return (actividad.hora || 'sin hora') + ' ' + tipoLegible(actividad.tipo) +
        (actividad.cliente_nombre ? ' con ' + actividad.cliente_nombre : '');
    });

    return 'Tenés ' + items.length + (items.length === 1 ? ' actividad' : ' actividades') +
      ' para ' + etiqueta + ': ' + partes.join('; ') +
      (items.length > 3 ? '. Hay más en la lista.' : '.');
  }

  function tipoLegible(tipo) {
    const nombres = {
      VISITA: 'Visita',
      REUNION: 'Reunión',
      LLAMADA: 'Llamada',
      INSPECCION: 'Inspección',
      PRESUPUESTO: 'Presupuesto',
      COMPRA: 'Compra',
      COBRO: 'Cobro'
    };
    return nombres[String(tipo || '').toUpperCase()] || String(tipo || 'Actividad');
  }

  function fechaISO(fecha) {
    return fecha.getFullYear() + '-' + dos(fecha.getMonth() + 1) + '-' + dos(fecha.getDate());
  }

  function sumarDiasISO(iso, dias) {
    const partes = String(iso).split('-').map(Number);
    return fechaISO(new Date(partes[0], partes[1] - 1, partes[2] + dias));
  }

  function fechaCorta(iso) {
    const partes = String(iso || '').split('-');
    if (partes.length !== 3) return String(iso || '');
    return partes[2] + '/' + partes[1] + '/' + partes[0];
  }

  function dos(numero) {
    return String(numero).padStart(2, '0');
  }

  function manejarError(error) {
    if (error && (error.codigo === 'SESION_INVALIDA' || error.codigo === 'SESION_VENCIDA')) {
      limpiarSesion();
      irA('login');
      loginMensaje('La sesión venció. Volvé a ingresar.');
      return;
    }
    const mensaje = (error && error.message) || 'Ocurrió un error inesperado.';
    agregarMensaje('asistente', mensaje);
    indicador(mensaje);
    hablar(mensaje);
  }

  function enviarManual(evento) {
    evento.preventDefault();
    const entrada = $('entrada-manual');
    const texto = entrada.value.trim();
    if (!texto) return;
    entrada.value = '';
    procesarTexto(texto);
  }

  function agregarMensaje(tipo, texto) {
    const nodo = document.createElement('div');
    nodo.className = 'mensaje ' + tipo;
    nodo.textContent = texto;
    $('conversacion').appendChild(nodo);
    $('conversacion').scrollTop = $('conversacion').scrollHeight;

    const mensajes = $('conversacion').querySelectorAll('.mensaje');
    if (mensajes.length > 12) {
      $('conversacion').removeChild(mensajes[0]);
    }
  }

  function indicador(texto) {
    $('indicador').textContent = texto;
  }

  function transcripcion(texto) {
    $('transcripcion').textContent = texto;
  }

  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[.,;:!?¿¡]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function nuevaClave() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    const aleatorio = Math.random().toString(36).slice(2) + Date.now().toString(36);
    return aleatorio.slice(0, 32);
  }

  document.addEventListener('DOMContentLoaded', iniciar);
})();
