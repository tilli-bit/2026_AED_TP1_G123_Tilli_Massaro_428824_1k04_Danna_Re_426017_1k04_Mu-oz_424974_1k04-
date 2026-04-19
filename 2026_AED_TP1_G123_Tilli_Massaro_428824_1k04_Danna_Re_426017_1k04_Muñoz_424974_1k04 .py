#Entrada de datos
beneficiario = input('Ingrese el nombre del beneficiario: ')
codigo = input('Ingrese el codigo: ')
base = int(input('Ingrese el monto base: '))

#Proceso Base
fijo = 25000
letra = str(codigo[0])
numero = int(codigo[1 : 3])
especificacion = int(codigo[4])

#Asignación de capitulos y monto por letra
if (letra == 'A' or letra == 'B' or letra == 'C' or  letra == 'D' or letra == 'E' or letra == 'F' or  letra == 'G' or
        letra == 'H' or letra == 'I' or letra == 'J' or letra == 'K' or letra == 'L'):
    monto2 = base + fijo + 25000
    monto_final = monto2 + monto2 * (especificacion / 100)
    if letra == 'A' or letra == 'B':
        capitulo = "Ciertas enfermedades infecciosas y parasitarias"
    elif letra == 'C' or (letra == 'D' and numero <= 48):
        capitulo = "Tumores [neoplasias]"
    elif letra == 'D' and numero >= 50 and numero <= 89:
        capitulo = ("Enfermedades de la sangre y de los órganos hematopoyéticos, y ciertos trastornos que afectan el "
                    "mecanismo de la inmunidad")
    elif letra == 'E':
        capitulo = "Enfermedades endocrinas, nutricionales y metabólicas "
    elif letra == 'F':
        capitulo = "Trastornos mentales y del comportamiento"
    elif letra == 'G':
        capitulo = "Enfermedades del sistema nervioso"
    elif letra == 'H' and numero <= 59:
        capitulo = "Enfermedades del ojo y sus anexos"
    elif letra == 'H' and numero >= 59:
        capitulo = "Enfermedades del oído y de la apófisis mastoides"
    elif letra == 'I':
        capitulo = "Enfermedades del sistema circulatorio"
    elif letra == 'J':
        capitulo = "Enfermedades del sistema respiratorio"
    elif letra == 'K':
        capitulo = "Enfermedades del sistema digestivo"
    elif letra == 'L':
        capitulo = "Enfermedades de la piel y del tejido subcutáneo"
elif (letra == 'M' or letra == 'N' or letra == 'O' or letra == 'P' or letra == 'Q' or letra == 'R' or letra == 'S' or
      letra == 'T'  or letra == 'V' or letra == 'Y' or letra == 'Z'):
    monto2 = base + fijo + 40000
    monto_final = monto2 + monto2 * (especificacion / 100)
    if letra == 'M':
        capitulo = "Enfermedades del sistema osteomuscular y del tejido conjuntivo"
    elif letra == 'N':
        capitulo = "Enfermedades del sistema genitourinario"
    elif letra == 'O':
        capitulo = "Embarazo, parto y puerperio"
    elif letra == 'P':
        capitulo = "Ciertas afecciones originadas en el período perinatal"
    elif letra == 'Q':
        capitulo = "Malformaciones congénitas, deformidades y anomalías cromosómicas"
    elif letra == 'R':
        capitulo = "Síntomas, signos y hallazgos anormales clínicos y de laboratorio, no clasificados en otra parte"
    elif letra == 'S' or letra == 'T':
        capitulo = "Traumatismos, envenenamientos y algunas otras consecuencias de causas externas"
    elif letra == 'V' or letra == 'Y':
        capitulo = "Causas externas de morbilidad y de mortalidad"
    elif letra == 'Z':
        capitulo = "Factores que influyen en el estado de salud y contacto con los servicios de salud"
elif letra == 'U':
    monto2 = base + fijo + 100000
    monto_final = monto2 + ( monto2 * (especificacion / 100))
    capitulo = "Códigos para propósitos especiales"

print("Beneficiario:", beneficiario)
print("Codigo:", codigo)
print("Capitulo:", capitulo)
print("Monto a pagar:", monto_final)
