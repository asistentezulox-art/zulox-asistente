/**
 * ZULOX_ASISTENTE - Interfaz web
 * Etapa 3: registro de actividades por voz.
 *
 * No contiene secretos. La URL de la API y el token de sesión se guardan
 * solamente en el navegador del usuario (localStorage).
 */

(function () {
  'use strict';

  const VERSION = '0.6.1';
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
    directorioCargando: false
  };

  const $ = function (id) { return document.getElementById(id); };

  const pantallas = {
    inicio: $('pantalla-inicio'),
    config: $('pantalla-config'),
    login: $('pantalla-login'),
    principal: $('pantalla-principal'),
    agenda: $('pantalla-agenda'),
    directorio: $('pantalla-directorio')
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
    const enPrincipal = nombre === 'principal' || nombre === 'agenda' || nombre === 'directorio';
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

  function api(accion, datos) {
    return apiEn(estado.api, accion, datos);
  }

  async function apiEn(url, accion, datos) {
    if (!url) throw new Error('Falta configurar la URL de la API.');

    const cuerpo = Object.assign({ accion: accion }, datos || {});
    if (estado.token && !cuerpo.token) cuerpo.token = estado.token;

    const controlador = new AbortController();
    const temporizador = setTimeout(function () { controlador.abort(); }, 20000);

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
        throw new Error('La API tardó demasiado. Revisá la conexión e intentá de nuevo.');
      }
      throw new Error('No pude conectarme con la API. Revisá Internet y la URL.');
    } finally {
      clearTimeout(temporizador);
    }

    const texto = await respuesta.text();
    let json;
    try {
      json = JSON.parse(texto);
    } catch (error) {
      throw new Error('La API respondió algo inesperado. Verificá que la URL termine en /exec.');
    }

    if (!json.ok) {
      const fallo = new Error(json.mensaje || 'La operación falló.');
      fallo.codigo = json.codigo || 'ERROR';
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
    const nombre = estado.usuario && estado.usuario.nombre ? estado.usuario.nombre : '';
    $('saludo').textContent = nombre ? 'Hola, ' + nombre + '.' : 'Hola.';
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
