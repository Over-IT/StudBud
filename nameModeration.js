(function () {
    'use strict';

    const blocked = /f+u+c+k+|s+h+i+t+|b+i+t+c+h+|c+u+n+t+|n+i+g+(e+r+|a+)|f+a+g+o+t+|p+o+r+n+|h+e+i+l+h+i+t+l+e+r+|k+i+l+y+o+u+r+s+e+l+f+/;
    const blockedWord = new RegExp('(^|[^a-z])(' + ['ass', 'dick', 'cock', 'sex', 'penis', 'vagina', 'slut', 'whore', 'fag', 'kys']
        .map(word => word.split('').join('[^a-z]*')).join('|') + ')([^a-z]|$)');
    const substitutions = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i' };

    function isBlocked(value) {
        const folded = String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
            .replace(/[01345789@$!]/g, char => substitutions[char]);
        return blocked.test(folded.replace(/[^a-z]/g, '')) || blockedWord.test(folded);
    }

    function assertAllowed(value, label = 'Name') {
        if (isBlocked(value)) {
            const error = new Error(`${label} contains inappropriate language. Please choose a different name.`);
            error.code = 'INAPPROPRIATE_NAME';
            throw error;
        }
        return value;
    }

    window.StudBudNameModeration = Object.freeze({ isBlocked, assertAllowed });
})();
