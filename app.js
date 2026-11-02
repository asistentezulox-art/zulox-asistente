/**
 * ZULOX_ASISTENTE - Interfaz web
 * Etapa 3: registro de actividades por voz.
 *
 * No contiene secretos. La URL de la API y el token de sesión se guardan
 * solamente en el navegador del usuario (localStorage).
 */

(function () {
  'use strict';

  const VERSION = '0.3.0';
  const CLAVE_API = 'zulox.api';
  const CLAVE_TOKEN = 'zulox.token';
  const CLAVE_USUARIO = 'zulox.usuario';
  const CLAVE_EMAIL = 'zulox.email';

  const estado = {
    api: '',
    token: '',
    usuario: null,
    reconocimiento: null,
    escuchando: false,
    ocupado: false,
    borrador: null,
    resumen: null,
    idempotencia: '',
    textoCompleto: '',
    inicio: ''
  };

  const $ = function (id) { return document.getElementById(id); };

  const pantallas = {
    inicio: $('pantalla-inicio'),
    config: $('pantalla-config'),
    login: $('pantalla-login'),
    principal: $('pantalla-principal')
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
    const enPrincipal = nombre === 'principal';
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
    agregarMensaje('asistente', '¿Qué querés agendar?');
    limpiarBorrador();
    estado.inicio = '';
    setTimeout(function () {
      if (!estado.inicio) {
        estado.inicio = '1';
        hablar('¿Qué querés agendar?');
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
    reconocimiento.continuous = false;
    reconocimiento.interimResults = true;
    reconocimiento.maxAlternatives = 1;

    reconocimiento.onstart = function () {
      estado.escuchando = true;
      $('btn-micro').classList.add('escuchando');
      $('btn-micro').setAttribute('aria-pressed', 'true');
      indicador('Escuchando…');
    };

    reconocimiento.onresult = function (evento) {
      let parcial = '';
      let final = '';
      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const texto = evento.results[i][0].transcript;
        if (evento.results[i].isFinal) {
          final += texto;
        } else {
          parcial += texto;
        }
      }
      if (parcial) transcripcion(parcial);
      if (final) {
        transcripcion(final.trim());
        procesarTexto(final.trim());
      }
    };

    reconocimiento.onerror = function (evento) {
      estado.escuchando = false;
      $('btn-micro').classList.remove('escuchando');
      $('btn-micro').setAttribute('aria-pressed', 'false');
      if (evento.error === 'aborted') return;

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
      $('btn-micro').classList.remove('escuchando');
      $('btn-micro').setAttribute('aria-pressed', 'false');
      if (!estado.ocupado && !estado.resumen) {
        const texto = $('indicador').textContent;
        if (texto === 'Escuchando…') indicador('Tocá el micrófono y hablá');
      }
    };

    estado.reconocimiento = reconocimiento;
  }

  function alternarMicro() {
    if (!estado.reconocimiento) {
      indicador('Este navegador no tiene reconocimiento de voz. Escribí la frase abajo.');
      $('entrada-manual').focus();
      return;
    }
    if (estado.escuchando) {
      try { estado.reconocimiento.stop(); } catch (error) {}
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
    transcripcion('');
    indicador('Escuchando…');
    try {
      estado.reconocimiento.start();
    } catch (error) {
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

    agregarMensaje('usuario', limpio);
    estado.textoCompleto = (estado.textoCompleto ? estado.textoCompleto + ' ' : '') + limpio;
    estado.ocupado = true;
    indicador('Interpretando…');
    $('btn-micro').disabled = true;

    api('voz.interpretar', { texto: limpio, borrador: estado.borrador })
      .then(function (respuesta) {
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
    cerrarResumen();
  }

  function confirmar() {
    if (!estado.resumen || !estado.borrador || estado.ocupado) return;
    estado.ocupado = true;
    $('btn-confirmar').disabled = true;
    $('btn-corregir').disabled = true;
    $('btn-cancelar').disabled = true;
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

  function corregir() {
    if (estado.ocupado) return;
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
