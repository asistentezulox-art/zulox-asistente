/**
 * ZULOX_ASISTENTE - Interfaz web
 * Etapa 3: registro de actividades por voz.
 *
 * No contiene secretos. La URL de la API y el token de sesión se guardan
 * solamente en el navegador del usuario (localStorage).
 */

(function () {
  'use strict';

  const VERSION = '0.5.2';
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
    agendaItems: []
  };

  const $ = function (id) { return document.getElementById(id); };

  const pantallas = {
    inicio: $('pantalla-inicio'),
    config: $('pantalla-config'),
    login: $('pantalla-login'),
    principal: $('pantalla-principal'),
    agenda: $('pantalla-agenda')
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
    $('form-reprogramar').addEventListener('submit', guardarReprogramacion);
    $('btn-reprogramar-cancelar').addEventListener('click', cerrarDialogoReprogramar);
    document.querySelectorAll('.btn-filtro').forEach(function (boton) {
      boton.addEventListener('click', function () {
        abrirAgenda(boton.getAttribute('data-rango'));
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
    const enPrincipal = nombre === 'principal' || nombre === 'agenda';
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
        email: datos.email
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
