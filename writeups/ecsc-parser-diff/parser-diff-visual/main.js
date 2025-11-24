"use strict";
// PARSER //
let FIREWALL_EXCEPTION_TRIGGERED = false;
Uint8Array.prototype.read = function (length = 1) {
    if (this.pointer === undefined || this.pointer === null) {
        this.pointer = 0;
    }
    if ((this.pointer + length) > this.length) {
        throw new RangeError(`Attempted to read from ${this.pointer} to ${this.pointer + length}, but the buffer is of length ${this.length}`);
    }
    let totalRead = this.pointer + length;
    let returnBuffer = this.slice(this.pointer, totalRead);
    this.pointer = totalRead;
    return returnBuffer;
};
function findEndOfContentBytes(element, index, array) {
    return (element === 0x00) && (array[index + 1] === 0x00);
}
class ASN1BERTag {
    tagValue;
    constructed;
    constructor(buffer, isFirewallParser = false) {
        this.tagValue = this.retrieveTag(buffer, isFirewallParser);
        this.constructed = this.isConstructed();
    }
    retrieveTag(buffer, isFirewallParser) {
        let firstOctet = buffer.read(1)[0];
        if (((firstOctet & 0x1F) === 0x1F) && !isFirewallParser) {
            console.log("Processing high-form tag");
            let octets = [firstOctet];
            while (true) {
                let octet = buffer.read(1)[0];
                octets = octets.concat(octet);
                if (!(octet & 0x80)) {
                    break;
                }
            }
            return Uint8Array.from(octets);
        }
        else {
            console.log("Processing low-form tag");
            return Uint8Array.from([firstOctet]);
        }
    }
    isConstructed() {
        return (this.tagValue[0] & 0x20) === 0x20;
    }
}
class ASN1BERLength {
    lengthValue;
    lengthBytes;
    constructor(buffer, isConstructed, isFirewallParser = false) {
        let lengthInfo = this.retrieveLength(buffer, isConstructed, isFirewallParser);
        this.lengthValue = lengthInfo[0];
        this.lengthBytes = lengthInfo[1];
    }
    retrieveLength(buffer, isConstructed, isFirewallParser) {
        let firstOctet = buffer.read(1)[0];
        if ((firstOctet === 0x80) && isConstructed && !isFirewallParser) {
            console.log("Processing indefinite length");
            // We search the rest of the buffer for 0x00,0x00 (end of content)
            let contentSearchBuffer = buffer.slice(buffer.pointer, buffer.length);
            return [contentSearchBuffer.findIndex(findEndOfContentBytes), Uint8Array.from([firstOctet])];
        }
        else if ((firstOctet & 0x80) && !isFirewallParser) {
            console.log("Processing long-form length");
            let octets = [firstOctet];
            let lengthLength = firstOctet ^ 0x80;
            for (let i = 0; i < lengthLength; i++) {
                let octet = buffer.read(1)[0];
                octets = octets.concat(octet);
            }
            let octetsBuffer = Uint8Array.from(octets);
            //@ts-ignore
            let length = parseInt(octetsBuffer.slice(1, octetsBuffer.length).toHex(), 16); // .toHex() not supported by TypeScript?
            return [length, octetsBuffer];
        }
        else {
            console.log("Processing short-form length");
            return [firstOctet, Uint8Array.from([firstOctet])];
        }
    }
}
class ASN1BERValue {
    content;
    constructor(buffer, length) {
        this.content = this.retrieveContent(buffer, length);
    }
    retrieveContent(buffer, length) {
        return buffer.read(length);
    }
}
class ASN1BER {
    tag;
    length;
    value;
    children = [];
    constructor(buffer, isFirewallParser = false) {
        this.tag = new ASN1BERTag(buffer, isFirewallParser);
        this.length = new ASN1BERLength(buffer, this.tag.constructed, isFirewallParser);
        this.value = new ASN1BERValue(buffer, this.length.lengthValue);
        console.log(`Final pointer: ${buffer.pointer}`);
        //@ts-ignore
        console.log(`Tag: ${this.tag.tagValue.toHex()}`);
        //@ts-ignore
        console.log(`Length: ${this.length.lengthBytes.toHex()}`);
        //@ts-ignore
        console.log(`Value: ${this.value.content.toHex()}`);
        if (isFirewallParser && !FIREWALL_EXCEPTION_TRIGGERED) {
            FIREWALL_EXCEPTION_TRIGGERED = true;
            let contentEnd = buffer.pointer;
            buffer.pointer = buffer.pointer - this.length.lengthValue;
            for (let i = 0; i < 3; i++) {
                this.children = this.children.concat(new ASN1BER(buffer, isFirewallParser));
                console.log("Added with Firewall exception");
            }
            return;
        }
        if (this.tag.constructed) {
            console.log("Processing constructed - definite-length");
            let contentEnd = buffer.pointer;
            buffer.pointer = buffer.pointer - this.length.lengthValue; // Reset pointer to beginning of value
            // Note that we have a special case with the Firewall parser where it will always try to get four children from the top most object as it searches for the PDU
            while (buffer.pointer < contentEnd) {
                this.children = this.children.concat(new ASN1BER(buffer, isFirewallParser));
                console.log("Added child");
                console.log(this.children);
            }
        }
    }
}
// RENDERING //
let GROUP_IDENTIFIER_COUNT = 1;
let createByteHTML = (bytes) => {
    let bytesHTML = [];
    bytes.forEach((byte) => {
        let byteHTML = document.createElement("div");
        byteHTML.classList.add("px-1");
        byteHTML.textContent = byte.toString(16).padStart(2, "0");
        bytesHTML = bytesHTML.concat(byteHTML);
    });
    return bytesHTML;
};
let createTagHTML = (byteHTML) => {
    let tagHTML = [];
    byteHTML.forEach((byte) => {
        byte.classList.add("text-(--color-orange)");
        tagHTML = tagHTML.concat(byte);
    });
    return tagHTML;
};
let createLengthHTML = (byteHTML) => {
    let lengthHTML = [];
    byteHTML.forEach((byte) => {
        byte.classList.add("text-(--color-blue)");
        lengthHTML = lengthHTML.concat(byte);
    });
    return lengthHTML;
};
let createValueHTML = (byteHTML) => {
    let valueHTML = [];
    byteHTML.forEach((byte) => {
        // We don't have any value specific styling atm.
        valueHTML = valueHTML.concat(byte);
    });
    return valueHTML;
};
function highlightByteGroup(byte) {
    let classList = byte.classList;
    let highestByteGroup = 1;
    classList.forEach((className) => {
        let byteGroupString = className.split("bytegroup-")[1];
        if (byteGroupString === undefined) {
            return;
        }
        let byteGroup = parseInt(byteGroupString);
        if (byteGroup > highestByteGroup) {
            highestByteGroup = byteGroup;
        }
    });
    let bytesToHighlight = document.getElementsByClassName(`bytegroup-${highestByteGroup}`);
    for (let i = 0; i < bytesToHighlight.length; i++) {
        bytesToHighlight[i].classList.add("bg-(--color-highlight)");
    }
}
function unhighlightBytes(parserDiv) {
    let bytes = parserDiv.children;
    for (let i = 0; i < bytes.length; i++) {
        bytes[i].classList.remove("bg-(--color-highlight)");
    }
}
function createASN1ByteHTML(asn1) {
    let groupIdentifier = GROUP_IDENTIFIER_COUNT;
    let tagHTML = createTagHTML(createByteHTML(asn1.tag.tagValue));
    let lengthHTML = createLengthHTML(createByteHTML(asn1.length.lengthBytes));
    let valueHTML = [];
    if (asn1.children.length != 0) {
        asn1.children.forEach((child, index) => {
            GROUP_IDENTIFIER_COUNT = groupIdentifier + index + 1;
            valueHTML = valueHTML.concat(createASN1ByteHTML(child));
        });
    }
    else {
        valueHTML = createValueHTML(createByteHTML(asn1.value.content));
        GROUP_IDENTIFIER_COUNT++;
    }
    let ASN1ByteHTML = [].concat(tagHTML, lengthHTML, valueHTML);
    ASN1ByteHTML.forEach((element) => {
        element.classList.add(`bytegroup-${groupIdentifier}`);
        element.setAttribute("onmouseover", "highlightByteGroup(this)");
    });
    return ASN1ByteHTML;
}
function updateStandardASN1Visualiser(byteString) {
    //@ts-ignore
    let asn1 = new ASN1BER(Uint8Array.fromHex(byteString));
    let byteBox = document.getElementById("StandardParser");
    let asn1HTML = createASN1ByteHTML(asn1);
    while (byteBox.lastChild) {
        byteBox.removeChild(byteBox.lastChild);
    }
    asn1HTML.forEach((div) => {
        byteBox.appendChild(div);
    });
}
function updateFirewallASN1Visualiser(byteString) {
    //@ts-ignore
    let asn1 = new ASN1BER(Uint8Array.fromHex(byteString), true);
    let byteBox = document.getElementById("FirewallParser");
    let asn1HTML = createASN1ByteHTML(asn1);
    while (byteBox.lastChild) {
        byteBox.removeChild(byteBox.lastChild);
    }
    asn1HTML.forEach((div) => {
        byteBox.appendChild(div);
    });
}
function updateVisualisers(byteString) {
    //This is ugly, but we're resetting the firewall parser exception each time we update. This is my quick alternative to changing the actual parser too much.
    FIREWALL_EXCEPTION_TRIGGERED = false;
    updateStandardASN1Visualiser(byteString);
    updateFirewallASN1Visualiser(byteString);
}
function setStandardInputExample() {
    let inputByteStringTextbox = document.getElementById("inputByteString");
    inputByteStringTextbox.value = "302202010104086669726577616c6ca1130201000201000201003008300606022a030500";
    inputByteStringTextbox.dispatchEvent(new Event("input"));
}
function setExploitInputExample() {
    let inputByteStringTextbox = document.getElementById("inputByteString");
    inputByteStringTextbox.value = "30230201010481086669726577616c6ca1130201000201000201003008300606022a030500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a000";
    inputByteStringTextbox.dispatchEvent(new Event("input"));
}
