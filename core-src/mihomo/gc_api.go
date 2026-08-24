//go:build android && cgo

package main

/*
#include <jni.h>
#include <stdlib.h>

static jstring gcNewString(JNIEnv *env, const char *s) {
    return (jstring)(*env)->NewStringUTF(env, s ? s : "");
}

static const char *gcGetString(JNIEnv *env, jstring s) {
    if (!s) return NULL;
    return (const char *)(*env)->GetStringUTFChars(env, s, NULL);
}

static void gcReleaseString(JNIEnv *env, jstring s, const char *c) {
    if (s && c) (*env)->ReleaseStringUTFChars(env, s, c);
}
*/
import "C"
import (
	"fmt"

	"github.com/metacubex/mihomo/config"
	"github.com/metacubex/mihomo/constant"
)

// gcInit(homeDir) — инициализация ядра (домашний каталог для гео-баз и кэшей).
// Возвращает "" при успехе, иначе текст ошибки.
//
//export Java_expo_modules_xraycore_GcCore_gcInit
func Java_expo_modules_xraycore_GcCore_gcInit(env *C.JNIEnv, clazz C.jclass, homeDir C.jstring) C.jstring {
	cHome := C.gcGetString(env, homeDir)
	defer C.gcReleaseString(env, homeDir, cHome)
	home := C.GoString(cHome)
	if home == "" {
		return C.gcNewString(env, C.CString("home-dir is empty"))
	}
	constant.SetHomeDir(home)
	params := fmt.Sprintf(`{"version":35,"home-dir":%q}`, home)
	if !handleInitClash(params) {
		return C.gcNewString(env, C.CString("init failed"))
	}
	return C.gcNewString(env, C.CString(""))
}


// gcStart(configYaml, tunFd) — применяет YAML-конфиг, запускает ядро и TUN.
// Возвращает "" при успехе, иначе текст ошибки.
//
//export Java_expo_modules_xraycore_GcCore_gcStart
func Java_expo_modules_xraycore_GcCore_gcStart(env *C.JNIEnv, clazz C.jclass, configYaml C.jstring, fd C.jint) C.jstring {
	cCfg := C.gcGetString(env, configYaml)
	defer C.gcReleaseString(env, configYaml, cCfg)

	raw, err := config.UnmarshalRawConfig([]byte(C.GoString(cCfg)))
	if err != nil {
		return C.gcNewString(env, C.CString(err.Error()))
	}
	params := defaultSetupParams()
	params.Config = raw
	if err := setupConfig(params); err != nil {
		return C.gcNewString(env, C.CString(err.Error()))
	}
	if !handleStartListener() {
		return C.gcNewString(env, C.CString("failed to start listener"))
	}
	handleStartTun(int(fd), nil)
	return C.gcNewString(env, C.CString(""))
}

// gcStop() — останавливает TUN и ядро.
//
//export Java_expo_modules_xraycore_GcCore_gcStop
func Java_expo_modules_xraycore_GcCore_gcStop(env *C.JNIEnv, clazz C.jclass) {
	handleStopTun()
	handleStopListener()
}

// gcVersion() — версия mihomo.
//
//export Java_expo_modules_xraycore_GcCore_gcVersion
func Java_expo_modules_xraycore_GcCore_gcVersion(env *C.JNIEnv, clazz C.jclass) C.jstring {
	return C.gcNewString(env, C.CString(fmt.Sprintf("mihomo %s", constant.Version)))
}
