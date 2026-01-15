<?php

// Define email recipients
define( "RECIPIENT_NAME", "Radiant Life Day Centre" );
define( "RECIPIENT_EMAIL", "info@radiantlifedaycentre.co.uk, stanley.ebosie@serinityhealthkare.co.uk" );

// Read the form values
$success = false;
$name = isset( $_POST['name'] ) ? preg_replace( "/[^\.\-\' a-zA-Z0-9]/", "", $_POST['name'] ) : "";
$senderEmail = isset( $_POST['email'] ) ? preg_replace( "/[^\.\-\_\@a-zA-Z0-9]/", "", $_POST['email'] ) : "";
$phone = isset( $_POST['phone'] ) ? preg_replace( "/[^\.\-\_\@a-zA-Z0-9]/", "", $_POST['phone'] ) : "";
$services = isset( $_POST['services'] ) ? preg_replace( "/[^\.\-\_\@a-zA-Z0-9]/", "", $_POST['services'] ) : "";
$subject = isset( $_POST['subject'] ) ? preg_replace( "/[^\.\-\_\@a-zA-Z0-9]/", "", $_POST['subject'] ) : "";
$address = isset( $_POST['address'] ) ? preg_replace( "/[^\.\-\_\@a-zA-Z0-9]/", "", $_POST['address'] ) : "";
$website = isset( $_POST['website'] ) ? preg_replace( "/[^\.\-\_\@a-zA-Z0-9]/", "", $_POST['website'] ) : "";
$message = isset( $_POST['message'] ) ? preg_replace( "/(From:|To:|BCC:|CC:|Subject:|Content-Type:)/", "", $_POST['message'] ) : "";

// Set email subject
$mail_subject = 'Website Contact Form: ' . $subject . ' - ' . $name;

// Build email body
$body = 'RADIANTLIFE DAY CENTRE - NEW CONTACT FORM SUBMISSION' . "\r\n";
$body .= '===================================================' . "\r\n\r\n";
$body .= 'Name: '. $name . "\r\n";
$body .= 'Email: '. $senderEmail . "\r\n";
$body .= 'Phone: '. $phone . "\r\n";
$body .= 'Subject: '. $subject . "\r\n";

// Add optional fields if provided
if ($services) {
    $body .= 'Services Interested In: '. $services . "\r\n";
}
if ($address) {
    $body .= 'Address: '. $address . "\r\n";
}
if ($website) {
    $body .= 'Website: '. $website . "\r\n";
}

$body .= "\r\n" . 'Message:' . "\r\n" . str_repeat('-', 50) . "\r\n";
$body .= $message . "\r\n\r\n";
$body .= '===================================================' . "\r\n";
$body .= 'Submitted: ' . date('F j, Y, g:i a') . "\r\n";
$body .= 'IP Address: ' . $_SERVER['REMOTE_ADDR'] . "\r\n";

// Set headers
$headers = "From: " . $name . " <" . $senderEmail . ">\r\n";
$headers .= "Reply-To: " . $senderEmail . "\r\n";
$headers .= "X-Mailer: PHP/" . phpversion() . "\r\n";
$headers .= "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/plain; charset=utf-8\r\n";

// If all required values exist, send the email
if ( $name && $senderEmail && $message ) {
    // Send to multiple recipients
    $recipients = explode(',', RECIPIENT_EMAIL);
    $all_sent = true;
    
    foreach ($recipients as $recipient_email) {
        $recipient_email = trim($recipient_email);
        $recipient = RECIPIENT_NAME . " <" . $recipient_email . ">";
        if (!mail( $recipient, $mail_subject, $body, $headers )) {
            $all_sent = false;
        }
    }
    
    if ($all_sent) {
        echo "<div class='inner success'><p class='success'>Thanks for contacting us. We will contact you ASAP!</p></div><!-- /.inner -->";
    } else {
        echo "<div class='inner error'><p class='error'>There was an issue sending your message. Please try again or contact us directly.</p></div><!-- /.inner -->";
    }
} else {
    echo "<div class='inner error'><p class='error'>Please fill in all required fields (Name, Email, and Message).</p></div><!-- /.inner -->";
}

?>